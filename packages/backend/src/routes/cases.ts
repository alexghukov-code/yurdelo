import { Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { writeAuditLog } from '../utils/audit.js';
import {
  validate, createCaseSchema, updateCaseSchema,
  changeCaseStatusSchema, setFinalResultSchema,
} from '../utils/validation.js';
import { getDb } from '../utils/db.js';
import '../types.js';

export function casesRouter(deps: { db: Pool; redis: Redis }) {
  const { db: rawDb } = deps;
  const router = Router();

  // ── GET /cases ──────────────────────────────────────
  router.get('/cases', requireAuth, async (req, res) => {
    const db = getDb(req, rawDb);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const status = (req.query.status as string) || null;
    const search = (req.query.search as string) || null;
    const isLawyer = req.user!.role === 'lawyer';

    let where = `WHERE c.deleted_at IS NULL`;
    const params: unknown[] = [];
    let idx = 1;

    if (isLawyer) {
      where += ` AND c.lawyer_id = $${idx++}`;
      params.push(req.user!.id);
    }
    if (status) {
      where += ` AND c.status = $${idx++}::case_status`;
      params.push(status);
    }
    if (search && search.length >= 2) {
      where += ` AND to_tsvector('russian', c.name) @@ plainto_tsquery('russian', $${idx++})`;
      params.push(search);
    }

    const limitIdx = idx++;
    const offsetIdx = idx++;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      db.query(
        `SELECT c.id, c.name, c.category, c.status, c.final_result, c.claim_amount,
                c.lawyer_id, c.plt_id, c.def_id, c.closed_at, c.created_at, c.updated_at,
                p.name AS plt_name, d.name AS def_name,
                u.last_name AS lawyer_last, u.first_name AS lawyer_first
         FROM cases c
         JOIN parties p ON p.id = c.plt_id
         JOIN parties d ON d.id = c.def_id
         JOIN users u ON u.id = c.lawyer_id
         ${where}
         ORDER BY c.created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, limit, offset],
      ),
      db.query(
        `SELECT count(*)::int AS total FROM cases c ${where}`,
        params,
      ),
    ]);

    const total = countRows[0]?.total ?? 0;
    res.json({
      data: rows.map(formatCase),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  // ── POST /cases ─────────────────────────────────────
  router.post('/cases', requireAuth, requireRole('admin', 'lawyer'), async (req, res) => {
    const db = getDb(req, rawDb);
    const body = validate(createCaseSchema, req.body);
    const lawyerId = req.user!.role === 'admin'
      ? (body.lawyerId ?? req.user!.id)
      : req.user!.id;

    const { rows } = await db.query(
      `INSERT INTO cases (name, plt_id, def_id, lawyer_id, category, claim_amount)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [body.name, body.pltId, body.defId, lawyerId, body.category, body.claimAmount ?? null],
    );

    await writeAuditLog(db, {
      userId: req.user!.id, action: 'CREATE', entityType: 'case',
      entityId: rows[0].id, newValue: { name: body.name, category: body.category },
      ip: req.ip, userAgent: req.headers['user-agent'] as string,
    });

    res.status(201).json({ data: formatCase(rows[0]) });
  });

  // ── GET /cases/:id ──────────────────────────────────
  router.get('/cases/:id', requireAuth, async (req, res) => {
    const db = getDb(req, rawDb);
    const { rows } = await db.query(
      `SELECT c.*, p.name AS plt_name, d.name AS def_name,
              u.last_name AS lawyer_last, u.first_name AS lawyer_first
       FROM cases c
       JOIN parties p ON p.id = c.plt_id
       JOIN parties d ON d.id = c.def_id
       JOIN users u ON u.id = c.lawyer_id
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [req.params.id],
    );
    if (!rows[0]) throw AppError.notFound('Дело не найдено.');
    assertAccess(rows[0], req.user!);

    // Fetch stages with hearings
    const { rows: stages } = await db.query(
      `SELECT s.*, st.name AS stage_type_name, st.sort_order AS type_sort_order
       FROM stages s JOIN stage_types st ON st.id = s.stage_type_id
       WHERE s.case_id = $1 AND s.deleted_at IS NULL ORDER BY s.sort_order`,
      [req.params.id],
    );
    const { rows: hearings } = await db.query(
      `SELECT h.* FROM hearings h
       JOIN stages s ON s.id = h.stage_id
       WHERE s.case_id = $1 AND s.deleted_at IS NULL AND h.deleted_at IS NULL
       ORDER BY h.datetime`,
      [req.params.id],
    );

    const stageMap = new Map<string, any[]>();
    for (const h of hearings) {
      if (!stageMap.has(h.stage_id)) stageMap.set(h.stage_id, []);
      stageMap.get(h.stage_id)!.push(formatHearing(h));
    }

    res.json({
      data: {
        ...formatCase(rows[0]),
        stages: stages.map((s: any) => ({
          id: s.id, stageTypeId: s.stage_type_id, stageTypeName: s.stage_type_name,
          sortOrder: s.sort_order, court: s.court, caseNumber: s.case_number,
          createdAt: s.created_at, updatedAt: s.updated_at,
          hearings: stageMap.get(s.id) ?? [],
        })),
      },
    });
  });

  // ── PATCH /cases/:id ────────────────────────────────
  router.patch('/cases/:id', requireAuth, requireRole('admin', 'lawyer'), async (req, res) => {
    const db = getDb(req, rawDb);
    await assertOwnership(db, req.params.id as string, req.user!);
    const body = validate(updateCaseSchema, req.body);

    const map: Record<string, string> = {
      name: 'name', pltId: 'plt_id', defId: 'def_id',
      category: 'category', claimAmount: 'claim_amount',
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [js, col] of Object.entries(map)) {
      const v = (body as any)[js];
      if (v !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(v); }
    }
    if (!sets.length) throw AppError.badRequest('Нет полей для обновления.');

    vals.push(req.params.id);
    const idIdx = idx++;
    vals.push(body.updatedAt);
    const uaIdx = idx++;

    const { rows } = await db.query(
      `UPDATE cases SET ${sets.join(', ')}
       WHERE id = $${idIdx} AND updated_at = $${uaIdx} AND deleted_at IS NULL
       RETURNING *`,
      vals,
    );
    if (!rows.length) {
      await checkExistsOrStale(db, 'cases', req.params.id as string);
    }
    res.json({ data: formatCase(rows[0]) });
  });

  // ── DELETE /cases/:id ───────────────────────────────
  router.delete('/cases/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const db = getDb(req, rawDb);
    const { rows: stages } = await db.query(
      `SELECT id FROM stages WHERE case_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [req.params.id],
    );
    if (stages.length) throw AppError.conflict('Нельзя удалить дело с активными стадиями.');

    const { rowCount } = await db.query(
      `UPDATE cases SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );
    if (!rowCount) throw AppError.notFound('Дело не найдено.');

    await writeAuditLog(db, {
      userId: req.user!.id, action: 'DELETE', entityType: 'case',
      entityId: req.params.id as string,
      ip: req.ip, userAgent: req.headers['user-agent'] as string,
    });
    res.json({ data: { message: 'Дело удалено.' } });
  });

  // ── PATCH /cases/:id/status ─────────────────────────
  router.patch('/cases/:id/status', requireAuth, requireRole('admin', 'lawyer'), async (req, res) => {
    const db = getDb(req, rawDb);
    await assertOwnership(db, req.params.id as string, req.user!);
    const { status, updatedAt } = validate(changeCaseStatusSchema, req.body);

    const extra = status === 'closed' ? `, closed_at = NOW()` : '';
    const { rows } = await db.query(
      `UPDATE cases SET status = $1${extra}
       WHERE id = $2 AND updated_at = $3 AND deleted_at IS NULL
       RETURNING *`,
      [status, req.params.id, updatedAt],
    );
    if (!rows.length) await checkExistsOrStale(db, 'cases', req.params.id as string);

    // Suggest final_result if closing without one
    const suggestion = status === 'closed' && !rows[0].final_result
      ? { suggestedAction: 'set_final_result' } : undefined;

    res.json({ data: formatCase(rows[0]), ...(suggestion && { suggestion }) });
  });

  // ── PATCH /cases/:id/final-result ───────────────────
  router.patch('/cases/:id/final-result', requireAuth, requireRole('admin', 'lawyer'), async (req, res) => {
    const db = getDb(req, rawDb);
    await assertOwnership(db, req.params.id as string, req.user!);
    const { finalResult, updatedAt } = validate(setFinalResultSchema, req.body);

    const { rows } = await db.query(
      `UPDATE cases SET final_result = $1
       WHERE id = $2 AND updated_at = $3 AND deleted_at IS NULL
       RETURNING *`,
      [finalResult, req.params.id, updatedAt],
    );
    if (!rows.length) await checkExistsOrStale(db, 'cases', req.params.id as string);
    res.json({ data: formatCase(rows[0]) });
  });

  // ── GET /cases/:id/transfers ────────────────────────
  router.get('/cases/:id/transfers', requireAuth, async (req, res) => {
    const db = getDb(req, rawDb);
    await assertOwnership(db, req.params.id as string, req.user!);

    const { rows } = await db.query(
      `SELECT t.*, f.last_name AS from_last, f.first_name AS from_first,
              r.last_name AS to_last, r.first_name AS to_first
       FROM transfers t
       JOIN users f ON f.id = t.from_id
       JOIN users r ON r.id = t.to_id
       WHERE t.case_id = $1 ORDER BY t.created_at DESC`,
      [req.params.id],
    );
    res.json({ data: rows.map(formatTransfer) });
  });

  return router;
}

// ── Helpers ───────────────────────────────────────────

function assertAccess(caseRow: any, user: { id: string; role: string }) {
  if (user.role === 'lawyer' && caseRow.lawyer_id !== user.id) {
    throw AppError.notFound('Дело не найдено.');
  }
}

async function assertOwnership(db: { query: (text: string, params?: unknown[]) => Promise<any> }, caseId: string, user: { id: string; role: string }) {
  if (user.role === 'admin') return;
  if (user.role === 'viewer') throw AppError.forbidden();
  const { rows } = await db.query(
    `SELECT id FROM cases WHERE id = $1 AND lawyer_id = $2 AND deleted_at IS NULL`,
    [caseId, user.id],
  );
  if (!rows.length) throw AppError.notFound('Дело не найдено.');
}

async function checkExistsOrStale(db: { query: (text: string, params?: unknown[]) => Promise<any> }, table: string, id: string): Promise<never> {
  const { rows } = await db.query(
    `SELECT id FROM ${table} WHERE id = $1 AND deleted_at IS NULL`, [id],
  );
  if (!rows.length) throw AppError.notFound('Запись не найдена.');
  throw AppError.conflict('Данные изменены другим пользователем. Обновите страницу.');
}

function formatCase(r: any) {
  return {
    id: r.id, name: r.name, category: r.category, status: r.status,
    finalResult: r.final_result, claimAmount: r.claim_amount,
    lawyerId: r.lawyer_id,
    pltId: r.plt_id, defId: r.def_id,
    pltName: r.plt_name, defName: r.def_name,
    lawyerName: r.lawyer_last ? `${r.lawyer_last} ${r.lawyer_first}` : undefined,
    closedAt: r.closed_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function formatHearing(h: any) {
  return {
    id: h.id, stageId: h.stage_id, type: h.type, datetime: h.datetime,
    result: h.result, appealed: h.appealed,
    newDatetime: h.new_datetime, adjReason: h.adj_reason, notes: h.notes,
    createdAt: h.created_at, updatedAt: h.updated_at,
  };
}

function formatTransfer(t: any) {
  return {
    id: t.id, caseId: t.case_id,
    fromId: t.from_id, toId: t.to_id,
    fromName: `${t.from_last} ${t.from_first}`,
    toName: `${t.to_last} ${t.to_first}`,
    transferDate: t.transfer_date, comment: t.comment, createdAt: t.created_at,
  };
}

export { assertOwnership, checkExistsOrStale };
