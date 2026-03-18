import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, USERS, CASES, authHeader } from './helpers.js';

let app: Express;
let pool: ReturnType<typeof buildTestApp>['pool'];

const NOW = new Date().toISOString();
const LAWYER2_ID = 'a0000000-0000-0000-0000-000000000010';

beforeEach(() => {
  const ctx = buildTestApp();
  app = ctx.app;
  pool = ctx.pool;
});

// ═══════════════════════════════════════════════════════
// POST /v1/transfers
// ═══════════════════════════════════════════════════════

describe('POST /v1/transfers', () => {
  const transferBody = { caseId: CASES.active.id, toId: LAWYER2_ID };

  it('creates transfer atomically (201)', async () => {
    const client = pool._client;
    const transfer = {
      id: 't1',
      case_id: CASES.active.id,
      from_id: USERS.lawyer.id,
      to_id: LAWYER2_ID,
      transfer_date: '2026-03-17',
      comment: null,
      created_at: NOW,
    };

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: CASES.active.id, lawyer_id: USERS.lawyer.id }] }) // case
      .mockResolvedValueOnce({ rows: [{ id: LAWYER2_ID }] }) // recipient active
      .mockResolvedValueOnce({ rows: [transfer], rowCount: 1 }) // INSERT transfer
      .mockResolvedValueOnce({ rows: [] }) // UPDATE case
      .mockResolvedValueOnce({ rows: [] }) // audit_log
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post('/v1/transfers')
      .set('Authorization', authHeader(USERS.lawyer))
      .send(transferBody);

    expect(res.status).toBe(201);
    expect(res.body.data.fromId).toBe(USERS.lawyer.id);
    expect(res.body.data.toId).toBe(LAWYER2_ID);
  });

  it('returns 409 when transferring to self (edge case)', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: CASES.active.id, lawyer_id: USERS.lawyer.id }] });

    const res = await request(app)
      .post('/v1/transfers')
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ caseId: CASES.active.id, toId: USERS.lawyer.id });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('текущему ответственному');
  });

  it('returns 409 on duplicate transfer same day (DB constraint)', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: CASES.active.id, lawyer_id: USERS.lawyer.id }] })
      .mockResolvedValueOnce({ rows: [{ id: LAWYER2_ID }] })
      .mockRejectedValueOnce({ code: '23505' }); // unique violation

    const res = await request(app)
      .post('/v1/transfers')
      .set('Authorization', authHeader(USERS.lawyer))
      .send(transferBody);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('уже передавалось');
  });

  it('returns 409 when recipient is inactive', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: CASES.active.id, lawyer_id: USERS.lawyer.id }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // recipient not found/inactive

    const res = await request(app)
      .post('/v1/transfers')
      .set('Authorization', authHeader(USERS.lawyer))
      .send(transferBody);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('неактивен');
  });

  it('lawyer cannot transfer other lawyers case → 403', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: CASES.active.id, lawyer_id: 'other-lawyer' }] });

    const res = await request(app)
      .post('/v1/transfers')
      .set('Authorization', authHeader(USERS.lawyer))
      .send(transferBody);

    expect(res.status).toBe(403);
  });

  it('viewer gets 403', async () => {
    const res = await request(app)
      .post('/v1/transfers')
      .set('Authorization', authHeader(USERS.viewer))
      .send(transferBody);
    expect(res.status).toBe(403);
  });

  it('returns 404 when case does not exist', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/v1/transfers')
      .set('Authorization', authHeader(USERS.admin))
      .send({ caseId: '00000000-0000-0000-0000-000000000000', toId: LAWYER2_ID });

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════
// GET /v1/transfers
// ═══════════════════════════════════════════════════════

describe('GET /v1/transfers', () => {
  it('admin sees all transfers', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await request(app)
      .get('/v1/transfers')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.meta).toBeDefined();
  });

  it('lawyer sees only own transfers (from_id or to_id filter)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await request(app)
      .get('/v1/transfers')
      .set('Authorization', authHeader(USERS.lawyer));

    expect(res.status).toBe(200);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('from_id'),
      expect.arrayContaining([USERS.lawyer.id]),
    );
  });

  it('supports date range filters', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await request(app)
      .get('/v1/transfers?dateFrom=2026-01-01&dateTo=2026-12-31')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════
// GET /v1/transfers/:id
// ═══════════════════════════════════════════════════════

describe('GET /v1/transfers/:id', () => {
  const mockTransfer = {
    id: 't1',
    case_id: CASES.active.id,
    from_id: USERS.lawyer.id,
    to_id: LAWYER2_ID,
    from_last: 'Петрова',
    from_first: 'Мария',
    to_last: 'Сидоров',
    to_first: 'Дмитрий',
    case_name: CASES.active.name,
    transfer_date: '2026-03-17',
    comment: null,
    created_at: NOW,
  };

  it('returns transfer details', async () => {
    pool.query.mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 });

    const res = await request(app)
      .get('/v1/transfers/t1')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data.fromName).toBe('Петрова Мария');
    expect(res.body.data.toName).toBe('Сидоров Дмитрий');
  });

  it('lawyer sees own transfer', async () => {
    pool.query.mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 });

    const res = await request(app)
      .get('/v1/transfers/t1')
      .set('Authorization', authHeader(USERS.lawyer));

    expect(res.status).toBe(200);
  });

  it('lawyer cannot see transfer they are not part of → 404', async () => {
    const other = { ...mockTransfer, from_id: 'x', to_id: 'y' };
    pool.query.mockResolvedValueOnce({ rows: [other], rowCount: 1 });

    const res = await request(app)
      .get('/v1/transfers/t1')
      .set('Authorization', authHeader(USERS.lawyer));

    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent transfer', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/v1/transfers/00000000-0000-0000-0000-000000000000')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(404);
  });
});
