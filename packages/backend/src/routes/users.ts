import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';
import { writeAuditLog } from '../utils/audit.js';
import {
  validate,
  createUserSchema,
  updateUserSchema,
  deactivateUserSchema,
  restoreUserSchema,
} from '../utils/validation.js';
import '../types.js';

export function usersRouter(deps: { db: Pool; redis: Redis }) {
  const { db, redis } = deps;
  const router = Router();

  // ── GET /users ──────────────────────────────────────
  router.get('/users', requireAuth, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const statusFilter = (req.query.status as string) || null;
    const roleFilter = (req.query.role as string) || null;

    const where = `WHERE deleted_at IS NULL
      AND ($1::text IS NULL OR status = $1::user_status)
      AND ($2::text IS NULL OR role = $2::user_role)`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      db.query(
        `SELECT id, email, role, status, first_name, last_name, middle_name, phone,
                two_fa_enabled, created_at, updated_at
         FROM users ${where}
         ORDER BY last_name, first_name
         LIMIT $3 OFFSET $4`,
        [statusFilter, roleFilter, limit, offset],
      ),
      db.query(`SELECT count(*)::int AS total FROM users ${where}`, [statusFilter, roleFilter]),
    ]);

    const total = countRows[0]?.total ?? 0;
    const isAdmin = req.user!.role === 'admin';

    res.json({
      data: rows.map((u: any) => formatUser(u, isAdmin)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  // ── POST /users ─────────────────────────────────────
  router.post('/users', requireAuth, requireRole('admin'), async (req, res) => {
    const body = validate(createUserSchema, req.body);

    // Check email unique
    const { rows: existing } = await db.query(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [body.email],
    );
    if (existing.length > 0) {
      throw AppError.conflict('Пользователь с таким email уже существует.');
    }

    const hash = await hashPassword(body.password);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, middle_name, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, role, status, first_name, last_name, middle_name, phone, created_at, updated_at`,
      [
        body.email,
        hash,
        body.role,
        body.firstName,
        body.lastName,
        body.middleName ?? null,
        body.phone ?? null,
      ],
    );

    await writeAuditLog(db, {
      userId: req.user!.id,
      action: 'CREATE',
      entityType: 'user',
      entityId: rows[0].id,
      newValue: { email: body.email, role: body.role },
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });

    res.status(201).json({ data: formatUser(rows[0], true) });
  });

  // ── GET /users/:id ─────────────────────────────────
  router.get('/users/:id', requireAuth, async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, email, role, status, first_name, last_name, middle_name, phone,
              two_fa_enabled, terminate_date, terminate_reason, created_at, updated_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );
    if (!rows[0]) throw AppError.notFound('Пользователь не найден.');

    res.json({ data: formatUser(rows[0], req.user!.role === 'admin') });
  });

  // ── PATCH /users/:id ───────────────────────────────
  router.patch('/users/:id', requireAuth, async (req, res) => {
    const isAdmin = req.user!.role === 'admin';
    const isSelf = req.user!.id === req.params.id;

    if (req.user!.role === 'viewer') throw AppError.forbidden();
    if (!isAdmin && !isSelf) throw AppError.forbidden();

    const body = validate(updateUserSchema, req.body);

    // Lawyer can only change own email/phone
    if (!isAdmin) {
      const disallowed = ['lastName', 'firstName', 'middleName', 'role'] as const;
      for (const key of disallowed) {
        if (body[key] !== undefined) {
          throw AppError.forbidden('Вы можете изменить только email и телефон.');
        }
      }
    }

    // Build dynamic SET
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      email: 'email',
      phone: 'phone',
      lastName: 'last_name',
      firstName: 'first_name',
      middleName: 'middle_name',
      role: 'role',
    };

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      const val = (body as any)[jsKey];
      if (val !== undefined) {
        sets.push(`${dbCol} = $${idx++}`);
        values.push(val);
      }
    }

    if (sets.length === 0) {
      throw AppError.badRequest('Нет полей для обновления.');
    }

    // Optimistic lock params
    values.push(req.params.id); // $N — id
    const idIdx = idx++;
    values.push(body.updatedAt); // $N+1 — known updated_at
    const uaIdx = idx++;

    const { rows } = await db.query(
      `UPDATE users SET ${sets.join(', ')}
       WHERE id = $${idIdx} AND updated_at = $${uaIdx} AND deleted_at IS NULL
       RETURNING id, email, role, status, first_name, last_name, middle_name, phone, updated_at`,
      values,
    );

    if (rows.length === 0) {
      // Distinguish 404 from stale data
      const { rows: check } = await db.query(
        `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [req.params.id],
      );
      if (check.length === 0) throw AppError.notFound('Пользователь не найден.');
      throw AppError.conflict('Данные изменены другим пользователем. Обновите страницу.');
    }

    res.json({ data: formatUser(rows[0], isAdmin) });
  });

  // ── POST /users/:id/deactivate ─────────────────────
  router.post('/users/:id/deactivate', requireAuth, requireRole('admin'), async (req, res) => {
    if (req.user!.id === req.params.id) {
      throw AppError.forbidden('Нельзя деактивировать собственный аккаунт.');
    }

    const body = validate(deactivateUserSchema, req.body);
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // 1. Get user
      const {
        rows: [target],
      } = await client.query(`SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, [
        req.params.id,
      ]);
      if (!target) throw AppError.notFound('Пользователь не найден.');
      if (target.status === 'inactive') throw AppError.conflict('Пользователь уже деактивирован.');

      // 2. Check not last admin
      if (target.role === 'admin') {
        const {
          rows: [{ count }],
        } = await client.query(
          `SELECT count(*)::int AS count FROM users
           WHERE role = 'admin' AND status = 'active' AND deleted_at IS NULL AND id != $1`,
          [req.params.id],
        );
        if (count === 0) {
          throw AppError.conflict('Невозможно: это единственный руководитель системы.');
        }
      }

      // 3. Handle active cases
      const { rows: activeCases } = await client.query(
        `SELECT id FROM cases WHERE lawyer_id = $1 AND status = 'active' AND deleted_at IS NULL`,
        [req.params.id],
      );

      if (activeCases.length > 0) {
        if (!body.transferToId) {
          throw AppError.conflict(
            `У пользователя ${activeCases.length} активных дел. Укажите transferToId для передачи.`,
          );
        }

        // Verify transfer target
        const {
          rows: [recipient],
        } = await client.query(
          `SELECT id FROM users WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
          [body.transferToId],
        );
        if (!recipient) throw AppError.conflict('Получатель дел не найден или неактивен.');

        // Bulk transfer
        await client.query(
          `UPDATE cases SET lawyer_id = $1
           WHERE lawyer_id = $2 AND status = 'active' AND deleted_at IS NULL`,
          [body.transferToId, req.params.id],
        );

        // Create transfer records
        for (const c of activeCases) {
          await client.query(
            `INSERT INTO transfers (case_id, from_id, to_id, comment)
             VALUES ($1, $2, $3, $4)`,
            [c.id, req.params.id, body.transferToId, `Автоматическая передача при деактивации`],
          );
        }
      }

      // 4. Deactivate
      await client.query(
        `UPDATE users SET status = 'inactive', terminate_date = $1, terminate_reason = $2
         WHERE id = $3`,
        [body.date, body.reason, req.params.id],
      );

      // 5. User history
      await client.query(
        `INSERT INTO user_history (user_id, event, event_date, comment, performed_by)
         VALUES ($1, 'deactivated', $2, $3, $4)`,
        [req.params.id, body.date, body.comment ?? null, req.user!.id],
      );

      // 6. Audit log
      await writeAuditLog(client, {
        userId: req.user!.id,
        action: 'DEACTIVATE',
        entityType: 'user',
        entityId: req.params.id as string,
        oldValue: { status: target.status, role: target.role },
        newValue: { status: 'inactive', terminateReason: body.reason },
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string,
      });

      await client.query('COMMIT');

      // After commit: invalidate all refresh tokens
      const keys = await redis.keys(`refresh:${req.params.id}:*`);
      if (keys.length > 0) await redis.del(...keys);

      res.json({ data: { message: 'Пользователь деактивирован.' } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── POST /users/:id/restore ────────────────────────
  router.post('/users/:id/restore', requireAuth, requireRole('admin'), async (req, res) => {
    const body = validate(restoreUserSchema, req.body);
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // 1. Get user
      const {
        rows: [target],
      } = await client.query(`SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, [
        req.params.id,
      ]);
      if (!target) throw AppError.notFound('Пользователь не найден.');
      if (target.status === 'active') throw AppError.conflict('Пользователь уже активен.');

      // 2. Check email not taken by another active user
      const { rows: emailCheck } = await client.query(
        `SELECT id FROM users WHERE email = $1 AND status = 'active' AND deleted_at IS NULL AND id != $2`,
        [target.email, req.params.id],
      );
      if (emailCheck.length > 0) {
        throw AppError.conflict('Email занят другим активным пользователем.');
      }

      // 3. Restore
      await client.query(
        `UPDATE users SET status = 'active', role = $1, terminate_date = NULL, terminate_reason = NULL
         WHERE id = $2`,
        [body.role, req.params.id],
      );

      // 4. User history
      await client.query(
        `INSERT INTO user_history (user_id, event, event_date, comment, performed_by)
         VALUES ($1, 'restored', $2, $3, $4)`,
        [req.params.id, body.date, body.comment ?? null, req.user!.id],
      );

      // 5. Audit log
      await writeAuditLog(client, {
        userId: req.user!.id,
        action: 'RESTORE',
        entityType: 'user',
        entityId: req.params.id as string,
        oldValue: { status: 'inactive', role: target.role },
        newValue: { status: 'active', role: body.role },
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string,
      });

      await client.query('COMMIT');
      res.json({ data: { message: 'Пользователь восстановлен.' } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── GET /users/:id/history ─────────────────────────
  router.get('/users/:id/history', requireAuth, async (req, res) => {
    const { rows } = await db.query(
      `SELECT h.id, h.event, h.event_date, h.comment, h.created_at,
              u.first_name AS performed_by_first, u.last_name AS performed_by_last
       FROM user_history h
       LEFT JOIN users u ON u.id = h.performed_by
       WHERE h.user_id = $1
       ORDER BY h.created_at DESC`,
      [req.params.id],
    );

    res.json({
      data: rows.map((r: any) => ({
        id: r.id,
        event: r.event,
        eventDate: r.event_date,
        comment: r.comment,
        performedBy: r.performed_by_first ? `${r.performed_by_last} ${r.performed_by_first}` : null,
        createdAt: r.created_at,
      })),
    });
  });

  return router;
}

// ── Helpers ───────────────────────────────────────────

function formatUser(u: any, full: boolean) {
  const base: Record<string, unknown> = {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    middleName: u.middle_name,
    role: u.role,
    status: u.status,
  };

  if (full) {
    Object.assign(base, {
      email: u.email,
      phone: u.phone,
      twoFaEnabled: u.two_fa_enabled,
      terminateDate: u.terminate_date ?? undefined,
      terminateReason: u.terminate_reason ?? undefined,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    });
  }

  return base;
}
