import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, USERS, authHeader } from './helpers.js';

let app: Express;
let pool: ReturnType<typeof buildTestApp>['pool'];
let redis: ReturnType<typeof buildTestApp>['redis'];

const NOW = new Date().toISOString();

beforeEach(() => {
  const ctx = buildTestApp();
  app = ctx.app;
  pool = ctx.pool;
  redis = ctx.redis;
});

// ═══════════════════════════════════════════════════════
// GET /v1/users
// ═══════════════════════════════════════════════════════

describe('GET /v1/users', () => {
  it('admin sees full user list with all fields', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [USERS.admin, USERS.lawyer], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ total: 2 }], rowCount: 1 });

    const res = await request(app).get('/v1/users').set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toHaveProperty('email');
    expect(res.body.data[0]).toHaveProperty('createdAt');
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
  });

  it('lawyer sees limited fields (no email, no createdAt)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [USERS.admin], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 });

    const res = await request(app).get('/v1/users').set('Authorization', authHeader(USERS.lawyer));

    expect(res.status).toBe(200);
    expect(res.body.data[0]).not.toHaveProperty('email');
    expect(res.body.data[0]).not.toHaveProperty('createdAt');
    expect(res.body.data[0]).toHaveProperty('firstName');
    expect(res.body.data[0]).toHaveProperty('role');
  });

  it('enforces limit max 100', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

    const res = await request(app)
      .get('/v1/users?limit=99999')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(100);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/v1/users');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════
// POST /v1/users
// ═══════════════════════════════════════════════════════

describe('POST /v1/users', () => {
  const validBody = {
    email: 'new@test.ru',
    password: 'Secure123',
    lastName: 'Новый',
    firstName: 'Юзер',
    role: 'lawyer',
  };

  it('admin creates user (201)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // email check
      .mockResolvedValueOnce({
        rows: [{ ...USERS.lawyer, id: 'new-id', email: 'new@test.ru', updated_at: NOW }],
        rowCount: 1,
      }) // INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit_log

    const res = await request(app)
      .post('/v1/users')
      .set('Authorization', authHeader(USERS.admin))
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.email).toBe('new@test.ru');
  });

  it('lawyer gets 403', async () => {
    const res = await request(app)
      .post('/v1/users')
      .set('Authorization', authHeader(USERS.lawyer))
      .send(validBody);

    expect(res.status).toBe(403);
  });

  it('returns 400 on missing required fields', async () => {
    const res = await request(app)
      .post('/v1/users')
      .set('Authorization', authHeader(USERS.admin))
      .send({ email: 'test@test.ru' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 on duplicate email', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'exists' }], rowCount: 1 });

    const res = await request(app)
      .post('/v1/users')
      .set('Authorization', authHeader(USERS.admin))
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('email');
  });
});

// ═══════════════════════════════════════════════════════
// GET /v1/users/:id
// ═══════════════════════════════════════════════════════

describe('GET /v1/users/:id', () => {
  it('admin sees full profile', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ ...USERS.lawyer, updated_at: NOW }], rowCount: 1 });

    const res = await request(app)
      .get(`/v1/users/${USERS.lawyer.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(USERS.lawyer.email);
    expect(res.body.data.updatedAt).toBeDefined();
  });

  it('lawyer sees limited fields', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ ...USERS.admin, updated_at: NOW }], rowCount: 1 });

    const res = await request(app)
      .get(`/v1/users/${USERS.admin.id}`)
      .set('Authorization', authHeader(USERS.lawyer));

    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('email');
    expect(res.body.data).not.toHaveProperty('updatedAt');
    expect(res.body.data.firstName).toBe('Алексей');
  });

  it('returns 404 for non-existent user', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/v1/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /v1/users/:id
// ═══════════════════════════════════════════════════════

describe('PATCH /v1/users/:id', () => {
  it('admin updates any user', async () => {
    const updated = { ...USERS.lawyer, email: 'updated@test.ru', updated_at: NOW };
    pool.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

    const res = await request(app)
      .patch(`/v1/users/${USERS.lawyer.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ email: 'updated@test.ru', updatedAt: NOW });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('updated@test.ru');
  });

  it('lawyer updates own email', async () => {
    const updated = { ...USERS.lawyer, email: 'newemail@test.ru', updated_at: NOW };
    pool.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

    const res = await request(app)
      .patch(`/v1/users/${USERS.lawyer.id}`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ email: 'newemail@test.ru', updatedAt: NOW });

    expect(res.status).toBe(200);
  });

  it('lawyer cannot update other user → 403', async () => {
    const res = await request(app)
      .patch(`/v1/users/${USERS.admin.id}`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ email: 'hack@test.ru', updatedAt: NOW });

    expect(res.status).toBe(403);
  });

  it('lawyer cannot change role → 403', async () => {
    const res = await request(app)
      .patch(`/v1/users/${USERS.lawyer.id}`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ role: 'admin', updatedAt: NOW });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('email и телефон');
  });

  it('viewer cannot PATCH → 403', async () => {
    const res = await request(app)
      .patch(`/v1/users/${USERS.viewer.id}`)
      .set('Authorization', authHeader(USERS.viewer))
      .send({ email: 'new@test.ru', updatedAt: NOW });

    expect(res.status).toBe(403);
  });

  it('returns 409 STALE_DATA on optimistic lock conflict', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE returns 0 rows
      .mockResolvedValueOnce({ rows: [{ id: USERS.lawyer.id }], rowCount: 1 }); // user exists

    const res = await request(app)
      .patch(`/v1/users/${USERS.lawyer.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ email: 'conflict@test.ru', updatedAt: '2020-01-01T00:00:00.000Z' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toContain('Обновите страницу');
  });

  it('returns 404 when user does not exist', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE returns 0
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // existence check

    const res = await request(app)
      .patch('/v1/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', authHeader(USERS.admin))
      .send({ email: 'x@test.ru', updatedAt: NOW });

    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid email format', async () => {
    const res = await request(app)
      .patch(`/v1/users/${USERS.lawyer.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ email: 'not-an-email', updatedAt: NOW });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when updatedAt is missing', async () => {
    const res = await request(app)
      .patch(`/v1/users/${USERS.lawyer.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ email: 'ok@test.ru' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'updatedAt' })]),
    );
  });
});

// ═══════════════════════════════════════════════════════
// POST /v1/users/:id/deactivate
// ═══════════════════════════════════════════════════════

describe('POST /v1/users/:id/deactivate', () => {
  const deactivateBody = { date: '2026-03-17', reason: 'Увольнение' };
  const targetUser = { ...USERS.lawyer, updated_at: NOW };

  it('admin deactivates user (no active cases)', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [targetUser], rowCount: 1 }) // SELECT user
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT active cases
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE deactivate
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT user_history
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT audit_log
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post(`/v1/users/${USERS.lawyer.id}/deactivate`)
      .set('Authorization', authHeader(USERS.admin))
      .send(deactivateBody);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('деактивирован');
  });

  it('admin deactivates with case transfer', async () => {
    const client = pool._client;
    const activeCases = [{ id: 'case-1' }, { id: 'case-2' }];
    const transferTo = 'a0000000-0000-0000-0000-000000000010';

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [targetUser], rowCount: 1 }) // SELECT user
      .mockResolvedValueOnce({ rows: activeCases, rowCount: 2 }) // SELECT active cases
      .mockResolvedValueOnce({ rows: [{ id: transferTo }], rowCount: 1 }) // verify recipient
      .mockResolvedValueOnce({ rows: [], rowCount: 2 }) // UPDATE cases
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT transfer 1
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT transfer 2
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE deactivate
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT user_history
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT audit_log
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post(`/v1/users/${USERS.lawyer.id}/deactivate`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ ...deactivateBody, transferToId: transferTo });

    expect(res.status).toBe(200);
    // Verify transfer records were created for each case
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO transfers'),
      expect.arrayContaining(['case-1']),
    );
  });

  it('stores user_history entry', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [targetUser], rowCount: 1 }) // SELECT user
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT active cases
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE deactivate
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT user_history
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT audit_log
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await request(app)
      .post(`/v1/users/${USERS.lawyer.id}/deactivate`)
      .set('Authorization', authHeader(USERS.admin))
      .send(deactivateBody);

    // Verify user_history INSERT was called with the user's ID
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_history'),
      expect.arrayContaining([USERS.lawyer.id]),
    );
  });

  it('cannot deactivate only admin → 409', async () => {
    const adminTarget = { ...USERS.admin, id: 'other-admin-id' };
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [adminTarget], rowCount: 1 }) // SELECT user (admin)
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 }); // no other admins

    const res = await request(app)
      .post('/v1/users/other-admin-id/deactivate')
      .set('Authorization', authHeader(USERS.admin))
      .send(deactivateBody);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('единственный руководитель');
  });

  it('cannot deactivate self → 403', async () => {
    const res = await request(app)
      .post(`/v1/users/${USERS.admin.id}/deactivate`)
      .set('Authorization', authHeader(USERS.admin))
      .send(deactivateBody);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('собственный');
  });

  it('lawyer gets 403', async () => {
    const res = await request(app)
      .post(`/v1/users/${USERS.admin.id}/deactivate`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send(deactivateBody);

    expect(res.status).toBe(403);
  });

  it('returns 409 when active cases exist and no transferToId', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [targetUser], rowCount: 1 }) // SELECT user
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }], rowCount: 1 }); // has active cases

    const res = await request(app)
      .post(`/v1/users/${USERS.lawyer.id}/deactivate`)
      .set('Authorization', authHeader(USERS.admin))
      .send(deactivateBody);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('активных дел');
  });

  it('invalidates Redis refresh tokens after deactivation', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [targetUser], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    // Pre-populate refresh token
    redis._store.set(`refresh:${USERS.lawyer.id}:tok1`, '1');

    await request(app)
      .post(`/v1/users/${USERS.lawyer.id}/deactivate`)
      .set('Authorization', authHeader(USERS.admin))
      .send(deactivateBody);

    expect(redis.keys).toHaveBeenCalledWith(`refresh:${USERS.lawyer.id}:*`);
    expect(redis.del).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════
// POST /v1/users/:id/restore
// ═══════════════════════════════════════════════════════

describe('POST /v1/users/:id/restore', () => {
  const restoreBody = { date: '2026-03-17', role: 'lawyer' as const };
  const inactiveUser = { ...USERS.inactive, updated_at: NOW };

  it('admin restores inactive user', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [inactiveUser], rowCount: 1 }) // SELECT user
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // email check
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE restore
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT user_history
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT audit_log
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post(`/v1/users/${USERS.inactive.id}/restore`)
      .set('Authorization', authHeader(USERS.admin))
      .send(restoreBody);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('восстановлен');
  });

  it('returns 409 when email is taken by another active user', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [inactiveUser], rowCount: 1 }) // SELECT user
      .mockResolvedValueOnce({ rows: [{ id: 'other' }], rowCount: 1 }); // email taken!

    const res = await request(app)
      .post(`/v1/users/${USERS.inactive.id}/restore`)
      .set('Authorization', authHeader(USERS.admin))
      .send(restoreBody);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('Email занят');
  });

  it('returns 409 when user is already active', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...USERS.lawyer, updated_at: NOW }], rowCount: 1 });

    const res = await request(app)
      .post(`/v1/users/${USERS.lawyer.id}/restore`)
      .set('Authorization', authHeader(USERS.admin))
      .send(restoreBody);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('уже активен');
  });

  it('lawyer gets 403', async () => {
    const res = await request(app)
      .post(`/v1/users/${USERS.inactive.id}/restore`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send(restoreBody);

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════
// GET /v1/users/:id/history
// ═══════════════════════════════════════════════════════

describe('GET /v1/users/:id/history', () => {
  it('returns history entries', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'h1',
          event: 'deactivated',
          event_date: '2026-03-01',
          comment: 'Увольнение',
          performed_by_first: 'Алексей',
          performed_by_last: 'Иванов',
          created_at: NOW,
        },
      ],
      rowCount: 1,
    });

    const res = await request(app)
      .get(`/v1/users/${USERS.lawyer.id}/history`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].event).toBe('deactivated');
    expect(res.body.data[0].performedBy).toBe('Иванов Алексей');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/v1/users/${USERS.lawyer.id}/history`);
    expect(res.status).toBe(401);
  });
});
