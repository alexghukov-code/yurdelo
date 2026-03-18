import { Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { writeAuditLog } from '../utils/audit.js';
import { validate, createHearingSchema, updateHearingSchema } from '../utils/validation.js';
import { checkExistsOrStale } from './cases.js';
import '../types.js';

export function hearingsRouter(deps: { db: Pool; redis: Redis }) {
  const { db } = deps;
  const router = Router();

  // ── POST /stages/:stageId/hearings ──────────────────
  router.post(
    '/stages/:stageId/hearings',
    requireAuth,
    requireRole('admin', 'lawyer'),
    async (req, res) => {
      const body = validate(createHearingSchema, req.body);

      // Verify stage → case ownership
      const {
        rows: [stage],
      } = await db.query(
        `SELECT s.case_id, c.lawyer_id FROM stages s
       JOIN cases c ON c.id = s.case_id
       WHERE s.id = $1 AND s.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [req.params.stageId],
      );
      if (!stage) throw AppError.notFound('Стадия не найдена.');
      if (req.user!.role === 'lawyer' && stage.lawyer_id !== req.user!.id) {
        throw AppError.notFound('Стадия не найдена.');
      }
      const { rows } = await db.query(
        `INSERT INTO hearings (stage_id, type, datetime, result, appealed, new_datetime, adj_reason, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          req.params.stageId,
          body.type,
          body.datetime,
          body.result ?? null,
          body.appealed ?? null,
          body.newDatetime ?? null,
          body.adjReason ?? null,
          body.notes ?? null,
        ],
      );

      await writeAuditLog(db, {
        userId: req.user!.id,
        action: 'CREATE',
        entityType: 'hearing',
        entityId: rows[0].id,
        newValue: body,
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string,
      });

      // If type=result, suggest setting final_result on the case
      const suggestion =
        body.type === 'result'
          ? { suggestedFinalResult: body.result, caseId: stage.case_id }
          : undefined;

      res.status(201).json({ data: formatHearing(rows[0]), ...(suggestion && { suggestion }) });
    },
  );

  // ── PATCH /hearings/:id ─────────────────────────────
  router.patch('/hearings/:id', requireAuth, requireRole('admin', 'lawyer'), async (req, res) => {
    const {
      rows: [hearing],
    } = await db.query(
      `SELECT h.*, c.lawyer_id FROM hearings h
       JOIN stages s ON s.id = h.stage_id
       JOIN cases c ON c.id = s.case_id
       WHERE h.id = $1 AND h.deleted_at IS NULL AND s.deleted_at IS NULL AND c.deleted_at IS NULL`,
      [req.params.id],
    );
    if (!hearing) throw AppError.notFound('Слушание не найдено.');
    if (req.user!.role === 'lawyer' && hearing.lawyer_id !== req.user!.id) {
      throw AppError.notFound('Слушание не найдено.');
    }

    const body = validate(updateHearingSchema, req.body);
    const map: Record<string, string> = {
      type: 'type',
      datetime: 'datetime',
      result: 'result',
      appealed: 'appealed',
      newDatetime: 'new_datetime',
      adjReason: 'adj_reason',
      notes: 'notes',
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
      `UPDATE hearings SET ${sets.join(', ')}
       WHERE id = $${idIdx} AND updated_at = $${uaIdx} AND deleted_at IS NULL
       RETURNING *`,
      vals,
    );
    if (!rows.length) await checkExistsOrStale(db, 'hearings', req.params.id as string);
    res.json({ data: formatHearing(rows[0]) });
  });

  // ── DELETE /hearings/:id ────────────────────────────
  router.delete('/hearings/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rowCount } = await client.query(
        `UPDATE hearings SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
        [req.params.id],
      );
      if (!rowCount) throw AppError.notFound('Слушание не найдено.');

      // Mark related documents as deleted (S3 lifecycle will clean up)
      await client.query(
        `UPDATE documents SET deleted_at = NOW() WHERE hearing_id = $1 AND deleted_at IS NULL`,
        [req.params.id],
      );

      await writeAuditLog(client, {
        userId: req.user!.id,
        action: 'DELETE',
        entityType: 'hearing',
        entityId: req.params.id as string,
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string,
      });

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ data: { message: 'Слушание удалено.' } });
  });

  return router;
}

function formatHearing(h: any) {
  return {
    id: h.id,
    stageId: h.stage_id,
    type: h.type,
    datetime: h.datetime,
    result: h.result,
    appealed: h.appealed,
    newDatetime: h.new_datetime,
    adjReason: h.adj_reason,
    notes: h.notes,
    createdAt: h.created_at,
    updatedAt: h.updated_at,
  };
}
