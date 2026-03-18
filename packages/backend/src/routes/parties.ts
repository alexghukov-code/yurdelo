import { Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { writeAuditLog } from '../utils/audit.js';
import { validate, createPartySchema, updatePartySchema } from '../utils/validation.js';
import '../types.js';

export function partiesRouter(deps: { db: Pool; redis: Redis }) {
  const { db } = deps;
  const router = Router();

  // ── GET /parties ────────────────────────────────────
  // All roles: Admin, Lawyer, Viewer
  router.get('/parties', requireAuth, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || null;
    const role = (req.query.role as string) || null;

    let where = `WHERE p.deleted_at IS NULL`;
    const params: unknown[] = [];
    let idx = 1;

    if (search && search.length >= 2) {
      where += ` AND (p.name ILIKE $${idx} OR p.inn ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    const limitIdx = idx++;
    const offsetIdx = idx++;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      db.query(
        `SELECT p.id, p.name, p.inn, p.ogrn, p.address, p.phone, p.email,
                p.created_at, p.updated_at
         FROM parties p
         ${where}
         ORDER BY p.name
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, limit, offset],
      ),
      db.query(
        `SELECT count(*)::int AS total FROM parties p ${where}`,
        params,
      ),
    ]);

    const total = countRows[0]?.total ?? 0;
    res.json({
      data: rows.map(formatParty),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  // ── POST /parties ───────────────────────────────────
  // Admin, Lawyer
  router.post('/parties', requireAuth, requireRole('admin', 'lawyer'), async (req, res) => {
    const body = validate(createPartySchema, req.body);

    // INN dedup: warning, not block
    let warning: string | undefined;
    if (body.inn) {
      const { rows: dups } = await db.query(
        `SELECT id, name FROM parties WHERE inn = $1 AND deleted_at IS NULL LIMIT 1`,
        [body.inn],
      );
      if (dups.length > 0) {
        warning = 'duplicate_inn';
      }
    }

    const { rows } = await db.query(
      `INSERT INTO parties (name, inn, ogrn, address, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        body.name, body.inn ?? null, body.ogrn ?? null,
        body.address ?? null, body.phone ?? null, body.email ?? null,
      ],
    );

    await writeAuditLog(db, {
      userId: req.user!.id,
      action: 'CREATE',
      entityType: 'party',
      entityId: rows[0].id,
      newValue: { name: body.name, inn: body.inn },
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });

    res.status(201).json({ data: formatParty(rows[0]), ...(warning && { warning }) });
  });

  // ── GET /parties/:id ────────────────────────────────
  // All roles
  router.get('/parties/:id', requireAuth, async (req, res) => {
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.inn, p.ogrn, p.address, p.phone, p.email,
              p.created_at, p.updated_at
       FROM parties p
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [req.params.id],
    );
    if (!rows[0]) throw AppError.notFound('Контрагент не найден.');

    // Fetch cases where this party is plaintiff or defendant
    const { rows: cases } = await db.query(
      `SELECT c.id, c.name, c.status, c.category
       FROM cases c
       WHERE (c.plt_id = $1 OR c.def_id = $1) AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC`,
      [req.params.id],
    );

    res.json({
      data: {
        ...formatParty(rows[0]),
        cases: cases.map((c: any) => ({
          id: c.id, name: c.name, status: c.status, category: c.category,
        })),
      },
    });
  });

  // ── PATCH /parties/:id ──────────────────────────────
  // Admin, Lawyer
  router.patch('/parties/:id', requireAuth, requireRole('admin', 'lawyer'), async (req, res) => {
    const body = validate(updatePartySchema, req.body);

    const map: Record<string, string> = {
      name: 'name', inn: 'inn', ogrn: 'ogrn',
      address: 'address', phone: 'phone', email: 'email',
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
      `UPDATE parties SET ${sets.join(', ')}
       WHERE id = $${idIdx} AND updated_at = $${uaIdx} AND deleted_at IS NULL
       RETURNING *`,
      vals,
    );

    if (!rows.length) {
      const { rows: check } = await db.query(
        `SELECT id FROM parties WHERE id = $1 AND deleted_at IS NULL`,
        [req.params.id],
      );
      if (!check.length) throw AppError.notFound('Контрагент не найден.');
      throw AppError.conflict('Данные изменены другим пользователем. Обновите страницу.');
    }

    res.json({ data: formatParty(rows[0]) });
  });

  // ── DELETE /parties/:id ─────────────────────────────
  // Admin only. Blocked if party has active cases.
  router.delete('/parties/:id', requireAuth, requireRole('admin'), async (req, res) => {
    // Check active cases
    const { rows: activeCases } = await db.query(
      `SELECT count(*)::int AS count FROM cases
       WHERE (plt_id = $1 OR def_id = $1)
         AND status = 'active' AND deleted_at IS NULL`,
      [req.params.id],
    );
    if (activeCases[0].count > 0) {
      throw AppError.conflict(
        `Контрагент используется в ${activeCases[0].count} активных делах.`,
      );
    }

    const { rowCount } = await db.query(
      `UPDATE parties SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );
    if (!rowCount) throw AppError.notFound('Контрагент не найден.');

    await writeAuditLog(db, {
      userId: req.user!.id,
      action: 'DELETE',
      entityType: 'party',
      entityId: req.params.id as string,
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });

    res.json({ data: { message: 'Контрагент удалён.' } });
  });

  return router;
}

function formatParty(p: any) {
  return {
    id: p.id,
    name: p.name,
    inn: p.inn,
    ogrn: p.ogrn,
    address: p.address,
    phone: p.phone,
    email: p.email,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}
