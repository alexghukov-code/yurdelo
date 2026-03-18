import { Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { writeAuditLog } from '../utils/audit.js';
import { validate, createTransferSchema } from '../utils/validation.js';
import { notifyTransfer } from '../services/notificationService.js';
import type { Queue } from 'bullmq';
import '../types.js';

export function transfersRouter(deps: { db: Pool; redis: Redis; emailQueue?: Queue | null }) {
  const { db } = deps;
  const emailQueue = deps.emailQueue ?? null;
  const router = Router();

  // ── POST /transfers ─────────────────────────────────
  router.post('/transfers', requireAuth, requireRole('admin', 'lawyer'), async (req, res) => {
    const body = validate(createTransferSchema, req.body);
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // 1. Get case + current owner + names
      const {
        rows: [caseRow],
      } = await client.query(
        `SELECT c.id, c.name, c.lawyer_id,
                u.last_name AS from_last, u.first_name AS from_first
         FROM cases c JOIN users u ON u.id = c.lawyer_id
         WHERE c.id = $1 AND c.deleted_at IS NULL`,
        [body.caseId],
      );
      if (!caseRow) throw AppError.notFound('Дело не найдено.');

      const fromId = caseRow.lawyer_id;

      // Lawyer must own the case
      if (req.user!.role === 'lawyer' && fromId !== req.user!.id) {
        throw AppError.forbidden('Вы не являетесь ответственным по этому делу.');
      }

      // 2. Cannot transfer to self
      if (fromId === body.toId) {
        throw AppError.conflict('Нельзя передать дело текущему ответственному.');
      }

      // 3. Verify recipient is active
      const {
        rows: [recipient],
      } = await client.query(
        `SELECT id, last_name, first_name FROM users WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
        [body.toId],
      );
      if (!recipient) throw AppError.conflict('Получатель не найден или неактивен.');

      // 4. Insert transfer (unique constraint catches same-day dups)
      let transfer;
      try {
        const { rows } = await client.query(
          `INSERT INTO transfers (case_id, from_id, to_id, comment)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [body.caseId, fromId, body.toId, body.comment ?? null],
        );
        transfer = rows[0];
      } catch (err: any) {
        if (err.code === '23505') {
          throw AppError.conflict('Дело уже передавалось этому пользователю сегодня.');
        }
        throw err;
      }

      // 5. Update case owner
      await client.query(`UPDATE cases SET lawyer_id = $1 WHERE id = $2`, [body.toId, body.caseId]);

      // 6. Audit log
      await writeAuditLog(client, {
        userId: req.user!.id,
        action: 'TRANSFER',
        entityType: 'case',
        entityId: body.caseId,
        oldValue: { lawyerId: fromId },
        newValue: { lawyerId: body.toId },
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string,
      });

      await client.query('COMMIT');

      // After commit: fire-and-forget notifications (never blocks response)
      notifyTransfer(db, emailQueue, {
        caseId: body.caseId,
        caseName: caseRow.name,
        fromId: fromId,
        fromName: `${caseRow.from_last} ${caseRow.from_first}`,
        toId: body.toId,
        toName: `${recipient.last_name} ${recipient.first_name}`,
      }).catch(() => {}); // swallow — logged via failed_notifications

      res.status(201).json({ data: formatTransfer(transfer) });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── GET /transfers ──────────────────────────────────
  router.get('/transfers', requireAuth, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const isLawyer = req.user!.role === 'lawyer';

    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (isLawyer) {
      where += ` AND (t.from_id = $${idx} OR t.to_id = $${idx})`;
      params.push(req.user!.id);
      idx++;
    }
    if (req.query.caseId) {
      where += ` AND t.case_id = $${idx++}`;
      params.push(req.query.caseId);
    }
    if (req.query.fromId) {
      where += ` AND t.from_id = $${idx++}`;
      params.push(req.query.fromId);
    }
    if (req.query.toId) {
      where += ` AND t.to_id = $${idx++}`;
      params.push(req.query.toId);
    }
    if (req.query.dateFrom) {
      where += ` AND t.transfer_date >= $${idx++}`;
      params.push(req.query.dateFrom);
    }
    if (req.query.dateTo) {
      where += ` AND t.transfer_date <= $${idx++}`;
      params.push(req.query.dateTo);
    }

    const [{ rows }, { rows: cnt }] = await Promise.all([
      db.query(
        `SELECT t.*, f.last_name AS from_last, f.first_name AS from_first,
                r.last_name AS to_last, r.first_name AS to_first,
                c.name AS case_name
         FROM transfers t
         JOIN users f ON f.id = t.from_id
         JOIN users r ON r.id = t.to_id
         JOIN cases c ON c.id = t.case_id
         ${where}
         ORDER BY t.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      ),
      db.query(`SELECT count(*)::int AS total FROM transfers t ${where}`, params),
    ]);

    const total = cnt[0]?.total ?? 0;
    res.json({
      data: rows.map(formatTransfer),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  // ── GET /transfers/:id ──────────────────────────────
  router.get('/transfers/:id', requireAuth, async (req, res) => {
    const {
      rows: [t],
    } = await db.query(
      `SELECT t.*, f.last_name AS from_last, f.first_name AS from_first,
              r.last_name AS to_last, r.first_name AS to_first,
              c.name AS case_name
       FROM transfers t
       JOIN users f ON f.id = t.from_id JOIN users r ON r.id = t.to_id
       JOIN cases c ON c.id = t.case_id
       WHERE t.id = $1`,
      [req.params.id],
    );
    if (!t) throw AppError.notFound('Передача не найдена.');
    if (req.user!.role === 'lawyer' && t.from_id !== req.user!.id && t.to_id !== req.user!.id) {
      throw AppError.notFound('Передача не найдена.');
    }
    res.json({ data: formatTransfer(t) });
  });

  return router;
}

function formatTransfer(t: any) {
  return {
    id: t.id,
    caseId: t.case_id,
    fromId: t.from_id,
    toId: t.to_id,
    fromName: t.from_last ? `${t.from_last} ${t.from_first}` : undefined,
    toName: t.to_last ? `${t.to_last} ${t.to_first}` : undefined,
    caseName: t.case_name,
    transferDate: t.transfer_date,
    comment: t.comment,
    createdAt: t.created_at,
  };
}
