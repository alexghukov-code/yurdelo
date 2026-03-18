import { Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { writeAuditLog } from '../utils/audit.js';
import { validate, createStageSchema, updateStageSchema } from '../utils/validation.js';
import { assertOwnership, checkExistsOrStale } from './cases.js';
import '../types.js';

export function stagesRouter(deps: { db: Pool; redis: Redis }) {
  const { db } = deps;
  const router = Router();

  // ── POST /cases/:caseId/stages ──────────────────────
  router.post(
    '/cases/:caseId/stages',
    requireAuth,
    requireRole('admin', 'lawyer'),
    async (req, res) => {
      await assertOwnership(db, req.params.caseId as string, req.user!);
      const body = validate(createStageSchema, req.body);

      // sort_order warning (not blocking)
      const { rows: existing } = await db.query(
        `SELECT sort_order FROM stages WHERE case_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
        [req.params.caseId],
      );
      const maxOrder = existing.length ? Math.max(...existing.map((s: any) => s.sort_order)) : 0;
      const warning =
        body.sortOrder <= maxOrder
          ? `Вы добавляете стадию с порядком ${body.sortOrder}, но уже существуют стадии с порядком до ${maxOrder}. Продолжить?`
          : undefined;

      const { rows } = await db.query(
        `INSERT INTO stages (case_id, stage_type_id, sort_order, court, case_number)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.params.caseId, body.stageTypeId, body.sortOrder, body.court, body.caseNumber],
      );

      await writeAuditLog(db, {
        userId: req.user!.id,
        action: 'CREATE',
        entityType: 'stage',
        entityId: rows[0].id,
        newValue: body,
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string,
      });

      res.status(201).json({ data: formatStage(rows[0]), ...(warning && { warning }) });
    },
  );

  // ── PATCH /stages/:id ───────────────────────────────
  router.patch('/stages/:id', requireAuth, requireRole('admin', 'lawyer'), async (req, res) => {
    // Lookup stage → case for ownership
    const {
      rows: [stage],
    } = await db.query(
      `SELECT s.*, c.lawyer_id FROM stages s JOIN cases c ON c.id = s.case_id
       WHERE s.id = $1 AND s.deleted_at IS NULL AND c.deleted_at IS NULL`,
      [req.params.id],
    );
    if (!stage) throw AppError.notFound('Стадия не найдена.');
    if (req.user!.role === 'lawyer' && stage.lawyer_id !== req.user!.id) {
      throw AppError.notFound('Стадия не найдена.');
    }

    const body = validate(updateStageSchema, req.body);
    const map: Record<string, string> = {
      stageTypeId: 'stage_type_id',
      sortOrder: 'sort_order',
      court: 'court',
      caseNumber: 'case_number',
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [js, col] of Object.entries(map)) {
      const v = (body as any)[js];
      if (v !== undefined) {
        sets.push(`${col} = $${idx++}`);
        vals.push(v);
      }
    }
    if (!sets.length) throw AppError.badRequest('Нет полей для обновления.');

    vals.push(req.params.id);
    const idIdx = idx++;
    vals.push(body.updatedAt);
    const uaIdx = idx++;

    const { rows } = await db.query(
      `UPDATE stages SET ${sets.join(', ')}
       WHERE id = $${idIdx} AND updated_at = $${uaIdx} AND deleted_at IS NULL
       RETURNING *`,
      vals,
    );
    if (!rows.length) await checkExistsOrStale(db, 'stages', req.params.id as string);
    res.json({ data: formatStage(rows[0]) });
  });

  // ── DELETE /stages/:id ──────────────────────────────
  router.delete('/stages/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const { rows: hearings } = await db.query(
      `SELECT id FROM hearings WHERE stage_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [req.params.id],
    );
    if (hearings.length) {
      throw AppError.conflict('Нельзя удалить стадию с активными слушаниями.');
    }

    const { rowCount } = await db.query(
      `UPDATE stages SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );
    if (!rowCount) throw AppError.notFound('Стадия не найдена.');

    await writeAuditLog(db, {
      userId: req.user!.id,
      action: 'DELETE',
      entityType: 'stage',
      entityId: req.params.id as string,
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });
    res.json({ data: { message: 'Стадия удалена.' } });
  });

  return router;
}

function formatStage(s: any) {
  return {
    id: s.id,
    caseId: s.case_id,
    stageTypeId: s.stage_type_id,
    sortOrder: s.sort_order,
    court: s.court,
    caseNumber: s.case_number,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}
