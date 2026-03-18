import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, USERS, CASES, authHeader } from './helpers.js';

let app: Express;
let pool: ReturnType<typeof buildTestApp>['pool'];

const NOW = new Date().toISOString();

beforeEach(() => {
  const ctx = buildTestApp();
  app = ctx.app;
  pool = ctx.pool;
});

// ═══════════════════════════════════════════════════════
// GET /v1/cases
// ═══════════════════════════════════════════════════════

describe('GET /v1/cases', () => {
  it('admin sees all cases', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [CASES.active], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const res = await request(app)
      .get('/v1/cases')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Взыскание задолженности');
    expect(res.body.meta.total).toBe(1);
  });

  it('lawyer sees only own cases (lawyer_id filter applied)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [CASES.active], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const res = await request(app)
      .get('/v1/cases')
      .set('Authorization', authHeader(USERS.lawyer));

    expect(res.status).toBe(200);
    // Verify lawyer_id param was passed in query
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('lawyer_id'),
      expect.arrayContaining([USERS.lawyer.id]),
    );
  });

  it('viewer can read cases', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await request(app)
      .get('/v1/cases')
      .set('Authorization', authHeader(USERS.viewer));

    expect(res.status).toBe(200);
  });

  it('caps limit at 100', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await request(app)
      .get('/v1/cases?limit=99999')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.body.meta.limit).toBe(100);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/v1/cases');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════
// POST /v1/cases
// ═══════════════════════════════════════════════════════

describe('POST /v1/cases', () => {
  const body = {
    name: 'Новое дело о взыскании',
    pltId: 'c0000000-0000-0000-0000-000000000001',
    defId: 'c0000000-0000-0000-0000-000000000002',
    category: 'civil',
  };

  it('admin creates case (201)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...CASES.active, id: 'new-id' }], rowCount: 1 }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // audit_log

    const res = await request(app)
      .post('/v1/cases')
      .set('Authorization', authHeader(USERS.admin))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
  });

  it('lawyer creates case (sets own lawyer_id)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...CASES.active, id: 'new-id' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/v1/cases')
      .set('Authorization', authHeader(USERS.lawyer))
      .send(body);

    expect(res.status).toBe(201);
    // Verify lawyer_id was set to current user
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cases'),
      expect.arrayContaining([USERS.lawyer.id]),
    );
  });

  it('viewer gets 403', async () => {
    const res = await request(app)
      .post('/v1/cases')
      .set('Authorization', authHeader(USERS.viewer))
      .send(body);
    expect(res.status).toBe(403);
  });

  it('returns 400 on missing name', async () => {
    const res = await request(app)
      .post('/v1/cases')
      .set('Authorization', authHeader(USERS.admin))
      .send({ ...body, name: undefined });
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is too short', async () => {
    const res = await request(app)
      .post('/v1/cases')
      .set('Authorization', authHeader(USERS.admin))
      .send({ ...body, name: 'Ab' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ═══════════════════════════════════════════════════════
// GET /v1/cases/:id
// ═══════════════════════════════════════════════════════

describe('GET /v1/cases/:id', () => {
  it('returns case with nested stages and hearings', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [CASES.active], rowCount: 1 }) // case
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })             // stages
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });            // hearings

    const res = await request(app)
      .get(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Взыскание задолженности');
    expect(res.body.data.stages).toEqual([]);
  });

  it('lawyer cannot see other lawyers case → 404', async () => {
    const otherCase = { ...CASES.active, lawyer_id: 'other-lawyer-id' };
    pool.query.mockResolvedValueOnce({ rows: [otherCase], rowCount: 1 });

    const res = await request(app)
      .get(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.lawyer));

    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent case', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/v1/cases/00000000-0000-0000-0000-000000000000')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /v1/cases/:id
// ═══════════════════════════════════════════════════════

describe('PATCH /v1/cases/:id', () => {
  it('admin updates case', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ ...CASES.active, name: 'Обновлённое' }], rowCount: 1,
    });

    const res = await request(app)
      .patch(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ name: 'Обновлённое', updatedAt: NOW });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Обновлённое');
  });

  it('lawyer updates own case', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: CASES.active.id }], rowCount: 1 }) // ownership check
      .mockResolvedValueOnce({ rows: [{ ...CASES.active, name: 'Upd' }], rowCount: 1 });

    const res = await request(app)
      .patch(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ name: 'Upd', updatedAt: NOW });

    expect(res.status).toBe(200);
  });

  it('returns 409 STALE_DATA on optimistic lock conflict', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })              // UPDATE returns 0
      .mockResolvedValueOnce({ rows: [{ id: CASES.active.id }], rowCount: 1 }); // exists

    const res = await request(app)
      .patch(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ name: 'Conflict', updatedAt: '2020-01-01T00:00:00Z' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('Обновите страницу');
  });

  it('returns 400 without updatedAt', async () => {
    const res = await request(app)
      .patch(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ name: 'NoLock' });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════
// DELETE /v1/cases/:id
// ═══════════════════════════════════════════════════════

describe('DELETE /v1/cases/:id', () => {
  it('admin soft-deletes case without stages', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })     // no stages
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })     // UPDATE deleted_at
      .mockResolvedValueOnce({ rows: [] });                 // audit_log

    const res = await request(app)
      .delete(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
  });

  it('returns 409 when case has active stages', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'stage-1' }], rowCount: 1 });

    const res = await request(app)
      .delete(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('стадиями');
  });

  it('lawyer gets 403', async () => {
    const res = await request(app)
      .delete(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /v1/cases/:id/status
// ═══════════════════════════════════════════════════════

describe('PATCH /v1/cases/:id/status', () => {
  it('changes status to closed and suggests final_result', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ ...CASES.active, status: 'closed', final_result: null }], rowCount: 1,
    });

    const res = await request(app)
      .patch(`/v1/cases/${CASES.active.id}/status`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ status: 'closed', updatedAt: NOW });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('closed');
    expect(res.body.suggestion).toEqual({ suggestedAction: 'set_final_result' });
  });

  it('returns 409 on stale data', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: CASES.active.id }], rowCount: 1 });

    const res = await request(app)
      .patch(`/v1/cases/${CASES.active.id}/status`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ status: 'closed', updatedAt: '2000-01-01T00:00:00Z' });

    expect(res.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /v1/cases/:id/final-result
// ═══════════════════════════════════════════════════════

describe('PATCH /v1/cases/:id/final-result', () => {
  it('sets final_result explicitly', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ ...CASES.active, final_result: 'win' }], rowCount: 1,
    });

    const res = await request(app)
      .patch(`/v1/cases/${CASES.active.id}/final-result`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ finalResult: 'win', updatedAt: NOW });

    expect(res.status).toBe(200);
    expect(res.body.data.finalResult).toBe('win');
  });

  it('returns 400 on invalid finalResult value', async () => {
    const res = await request(app)
      .patch(`/v1/cases/${CASES.active.id}/final-result`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ finalResult: 'invalid', updatedAt: NOW });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════
// RLS integration: role-based access via full pipeline
// ═══════════════════════════════════════════════════════

describe('RLS integration: role-based access control', () => {
  it('lawyer: GET /cases filters by lawyer_id (sees only own)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [CASES.active], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    await request(app)
      .get('/v1/cases')
      .set('Authorization', authHeader(USERS.lawyer));

    // The SQL must include lawyer_id filter
    const selectCall = pool.query.mock.calls[0];
    expect(selectCall[0]).toContain('lawyer_id');
    expect(selectCall[1]).toContain(USERS.lawyer.id);
  });

  it('lawyer: GET /cases/:id returns 404 for other lawyers case', async () => {
    const otherCase = { ...CASES.active, lawyer_id: 'other-lawyer-id' };
    pool.query.mockResolvedValueOnce({ rows: [otherCase], rowCount: 1 });

    const res = await request(app)
      .get(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.lawyer));

    expect(res.status).toBe(404);
  });

  it('lawyer: PATCH /cases/:id forbidden for other lawyers case', async () => {
    // Ownership check fails — lawyer doesn't own this case
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // assertOwnership query

    const res = await request(app)
      .patch(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ name: 'Hijack', updatedAt: NOW });

    expect(res.status).toBe(404);
  });

  it('viewer: GET /cases returns 200 (read allowed)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [CASES.active], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const res = await request(app)
      .get('/v1/cases')
      .set('Authorization', authHeader(USERS.viewer));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('viewer: POST /cases returns 403 (write blocked)', async () => {
    const res = await request(app)
      .post('/v1/cases')
      .set('Authorization', authHeader(USERS.viewer))
      .send({ name: 'Attempt', pltId: 'p1', defId: 'd1', category: 'civil' });

    expect(res.status).toBe(403);
  });

  it('viewer: DELETE /cases returns 403', async () => {
    const res = await request(app)
      .delete(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.viewer));

    expect(res.status).toBe(403);
  });

  it('viewer: PATCH /cases/:id/status returns 403', async () => {
    const res = await request(app)
      .patch(`/v1/cases/${CASES.active.id}/status`)
      .set('Authorization', authHeader(USERS.viewer))
      .send({ status: 'closed', updatedAt: NOW });

    expect(res.status).toBe(403);
  });

  it('admin: GET /cases has NO lawyer_id filter (sees all)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [CASES.active], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    await request(app)
      .get('/v1/cases')
      .set('Authorization', authHeader(USERS.admin));

    // SQL should NOT contain lawyer_id filter
    const sql = pool.query.mock.calls[0][0] as string;
    const whereClause = sql.split('WHERE')[1]?.split('ORDER')[0] ?? '';
    expect(whereClause).not.toContain('lawyer_id');
  });

  it('admin: GET /cases/:id succeeds for any case', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [CASES.active], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
  });

  it('admin: DELETE /cases allowed', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
  });
});
