import { Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import '../types.js';

export function notificationsRouter(deps: { db: Pool; redis: Redis }) {
  const { db } = deps;
  const router = Router();

  // ── GET /notifications ──────────────────────────────
  router.get('/notifications', requireAuth, async (req, res) => {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const isReadFilter = req.query.is_read;

    let where = `WHERE n.user_id = $1`;
    const params: unknown[] = [req.user!.id];
    let idx = 2;

    if (isReadFilter === 'true') {
      where += ` AND n.is_read = true`;
    } else if (isReadFilter === 'false') {
      where += ` AND n.is_read = false`;
    }

    const { rows } = await db.query(
      `SELECT n.id, n.type, n.title, n.message, n.link,
              n.entity_type, n.entity_id, n.is_read, n.created_at
       FROM notifications n
       ${where}
       ORDER BY n.created_at DESC
       LIMIT $${idx++}`,
      [...params, limit],
    );

    const { rows: [{ count }] } = await db.query(
      `SELECT count(*)::int AS count FROM notifications n
       WHERE n.user_id = $1 AND n.is_read = false`,
      [req.user!.id],
    );

    res.json({
      data: rows.map(formatNotification),
      meta: { unreadCount: count },
    });
  });

  // ── PATCH /notifications/:id/read ───────────────────
  router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
    const { rowCount } = await db.query(
      `UPDATE notifications SET is_read = true
       WHERE id = $1 AND user_id = $2 AND is_read = false`,
      [req.params.id, req.user!.id],
    );
    if (!rowCount) {
      // Check existence
      const { rows } = await db.query(
        `SELECT id FROM notifications WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user!.id],
      );
      if (!rows.length) throw AppError.notFound('Уведомление не найдено.');
      // Already read — idempotent OK
    }

    res.json({ data: { message: 'Отмечено как прочитанное.' } });
  });

  // ── PATCH /notifications/read-all ───────────────────
  router.patch('/notifications/read-all', requireAuth, async (req, res) => {
    const { rowCount } = await db.query(
      `UPDATE notifications SET is_read = true
       WHERE user_id = $1 AND is_read = false`,
      [req.user!.id],
    );
    res.json({ data: { message: 'Все уведомления прочитаны.', updated: rowCount } });
  });

  return router;
}

function formatNotification(n: any) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    entityType: n.entity_type,
    entityId: n.entity_id,
    isRead: n.is_read,
    createdAt: n.created_at,
  };
}
