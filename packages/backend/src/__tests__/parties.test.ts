import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, USERS, PARTIES, CASES, authHeader } from './helpers.js';

let app: Express;
let pool: ReturnType<typeof buildTestApp>['pool'];

const NOW = new Date().toISOString();

const PARTY_ROW = {
  id: PARTIES.plaintiff.id,
  name: 'ООО Альфа',
  inn: '7701234567',
  ogrn: null,
  address: 'Москва, ул. Тестовая 1',
  phone: '+7 495 123-45-67',
  email: 'info@alfa.ru',
  created_at: NOW,
  updated_at: NOW,
};

beforeEach(() => {
  const ctx = buildTestApp();
  app = ctx.app;
  pool = ctx.pool;
});

// ═══════════════════════════════════════════════════════
// GET /v1/parties
// ═══════════════════════════════════════════════════════

describe('GET /v1/parties', () => {
  it('returns paginated list', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [PARTY_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const res = await request(app)
      .get('/v1/parties')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('ООО Альфа');
    expect(res.body.data[0].inn).toBe('7701234567');
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('viewer can read parties', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await request(app)
      .get('/v1/parties')
      .set('Authorization', authHeader(USERS.viewer));

    expect(res.status).toBe(200);
  });

  it('search filters by name or INN', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    await request(app)
      .get('/v1/parties?search=Альфа')
      .set('Authorization', authHeader(USERS.admin));

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ILIKE'),
      expect.arrayContaining(['%Альфа%']),
    );
  });

  it('caps limit at 100', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await request(app)
      .get('/v1/parties?limit=99999')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.body.meta.limit).toBe(100);
  });

  it('401 without auth', async () => {
    const res = await request(app).get('/v1/parties');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════
// POST /v1/parties
// ═══════════════════════════════════════════════════════

describe('POST /v1/parties', () => {
  const body = { name: 'ООО Новый Контрагент', inn: '7702345678' };

  it('creates party (201)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })             // INN check — no dup
      .mockResolvedValueOnce({ rows: [{ ...PARTY_ROW, ...body }], rowCount: 1 }) // INSERT
      .mockResolvedValueOnce({ rows: [] });                         // audit_log

    const res = await request(app)
      .post('/v1/parties')
      .set('Authorization', authHeader(USERS.lawyer))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('ООО Новый Контрагент');
    expect(res.body.warning).toBeUndefined();
  });

  it('returns warning: duplicate_inn when INN matches existing (not blocking)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'existing', name: 'Old' }], rowCount: 1 }) // INN dup!
      .mockResolvedValueOnce({ rows: [{ ...PARTY_ROW, ...body }], rowCount: 1 })        // INSERT still happens
      .mockResolvedValueOnce({ rows: [] });                                              // audit

    const res = await request(app)
      .post('/v1/parties')
      .set('Authorization', authHeader(USERS.admin))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.warning).toBe('duplicate_inn');
    // Record IS created despite warning
    expect(res.body.data).toHaveProperty('id');
  });

  it('creates party without INN (no dedup check)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...PARTY_ROW, inn: null }], rowCount: 1 }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .post('/v1/parties')
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ name: 'Без ИНН' });

    expect(res.status).toBe(201);
    // INN check should NOT have been called (only 2 queries: INSERT + audit)
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('records audit_log', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [PARTY_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post('/v1/parties')
      .set('Authorization', authHeader(USERS.admin))
      .send(body);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_log'),
      expect.arrayContaining(['CREATE', 'party']),
    );
  });

  it('viewer gets 403', async () => {
    const res = await request(app)
      .post('/v1/parties')
      .set('Authorization', authHeader(USERS.viewer))
      .send(body);
    expect(res.status).toBe(403);
  });

  it('returns 400 on missing name', async () => {
    const res = await request(app)
      .post('/v1/parties')
      .set('Authorization', authHeader(USERS.admin))
      .send({ inn: '123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is too short', async () => {
    const res = await request(app)
      .post('/v1/parties')
      .set('Authorization', authHeader(USERS.admin))
      .send({ name: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ═══════════════════════════════════════════════════════
// GET /v1/parties/:id
// ═══════════════════════════════════════════════════════

describe('GET /v1/parties/:id', () => {
  it('returns party with associated cases', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [PARTY_ROW], rowCount: 1 })  // party
      .mockResolvedValueOnce({                                      // cases
        rows: [{ id: CASES.active.id, name: CASES.active.name, status: 'active', category: 'civil' }],
        rowCount: 1,
      });

    const res = await request(app)
      .get(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('ООО Альфа');
    expect(res.body.data.cases).toHaveLength(1);
    expect(res.body.data.cases[0].id).toBe(CASES.active.id);
  });

  it('returns 404 for deleted party', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/v1/parties/00000000-0000-0000-0000-000000000000')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(404);
  });

  it('viewer can read party detail', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [PARTY_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.viewer));

    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /v1/parties/:id
// ═══════════════════════════════════════════════════════

describe('PATCH /v1/parties/:id', () => {
  it('updates party', async () => {
    const updated = { ...PARTY_ROW, name: 'Обновлённый' };
    pool.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

    const res = await request(app)
      .patch(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ name: 'Обновлённый', updatedAt: NOW });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Обновлённый');
  });

  it('lawyer can update party', async () => {
    pool.query.mockResolvedValueOnce({ rows: [PARTY_ROW], rowCount: 1 });

    const res = await request(app)
      .patch(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ phone: '+7 999 000-00-00', updatedAt: NOW });

    expect(res.status).toBe(200);
  });

  it('viewer gets 403', async () => {
    const res = await request(app)
      .patch(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.viewer))
      .send({ name: 'Hack', updatedAt: NOW });
    expect(res.status).toBe(403);
  });

  it('returns 409 STALE_DATA on optimistic lock conflict', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })              // UPDATE 0 rows
      .mockResolvedValueOnce({ rows: [{ id: PARTIES.plaintiff.id }], rowCount: 1 }); // exists

    const res = await request(app)
      .patch(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ name: 'Conflict', updatedAt: '2000-01-01T00:00:00Z' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('Обновите страницу');
  });

  it('returns 404 for non-existent party', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .patch('/v1/parties/00000000-0000-0000-0000-000000000000')
      .set('Authorization', authHeader(USERS.admin))
      .send({ name: 'Новое имя', updatedAt: NOW });

    expect(res.status).toBe(404);
  });

  it('returns 400 without updatedAt', async () => {
    const res = await request(app)
      .patch(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ name: 'Missing lock' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'updatedAt' })]),
    );
  });
});

// ═══════════════════════════════════════════════════════
// DELETE /v1/parties/:id
// ═══════════════════════════════════════════════════════

describe('DELETE /v1/parties/:id', () => {
  it('admin soft-deletes party without active cases', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })  // active cases check
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })              // soft delete
      .mockResolvedValueOnce({ rows: [] });                          // audit

    const res = await request(app)
      .delete(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('удалён');
  });

  it('returns 409 when party has active cases (edge case from TZ)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ count: 3 }], rowCount: 1 });

    const res = await request(app)
      .delete(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('3 активных делах');
  });

  it('records audit_log on delete', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .delete(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_log'),
      expect.arrayContaining(['DELETE', 'party']),
    );
  });

  it('lawyer gets 403', async () => {
    const res = await request(app)
      .delete(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.status).toBe(403);
  });

  it('viewer gets 403', async () => {
    const res = await request(app)
      .delete(`/v1/parties/${PARTIES.plaintiff.id}`)
      .set('Authorization', authHeader(USERS.viewer));
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent party', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .delete('/v1/parties/00000000-0000-0000-0000-000000000000')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).delete(`/v1/parties/${PARTIES.plaintiff.id}`);
    expect(res.status).toBe(401);
  });
});
