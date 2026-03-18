import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, USERS, CASES, STAGES, authHeader } from './helpers.js';

let app: Express;
let pool: ReturnType<typeof buildTestApp>['pool'];

const NOW = new Date().toISOString();

beforeEach(() => {
  const ctx = buildTestApp();
  app = ctx.app;
  pool = ctx.pool;
});

const stageBody = {
  stageTypeId: 'a0000000-0000-0000-0000-000000000002',
  sortOrder: 2,
  court: 'Арбитражный суд г. Москвы',
  caseNumber: 'А40-12345/2025',
};

// ═══════════════════════════════════════════════════════
// POST /v1/cases/:caseId/stages
// ═══════════════════════════════════════════════════════

describe('POST /v1/cases/:caseId/stages', () => {
  it('creates stage (201)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: CASES.active.id }], rowCount: 1 }) // ownership
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                        // existing stages
      .mockResolvedValueOnce({ rows: [STAGES.first], rowCount: 1 })            // INSERT
      .mockResolvedValueOnce({ rows: [] });                                    // audit_log

    const res = await request(app)
      .post(`/v1/cases/${CASES.active.id}/stages`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send(stageBody);

    expect(res.status).toBe(201);
    expect(res.body.data.court).toBe('Арбитражный суд г. Москвы');
  });

  it('returns warning when sort_order is not sequential', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: CASES.active.id }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ sort_order: 3 }], rowCount: 1 })      // existing stage has order 3
      .mockResolvedValueOnce({ rows: [STAGES.first], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post(`/v1/cases/${CASES.active.id}/stages`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ ...stageBody, sortOrder: 1 }); // lower than existing 3

    expect(res.status).toBe(201);
    expect(res.body.warning).toContain('порядком');
  });

  it('viewer gets 403', async () => {
    const res = await request(app)
      .post(`/v1/cases/${CASES.active.id}/stages`)
      .set('Authorization', authHeader(USERS.viewer))
      .send(stageBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 when court name is too short', async () => {
    const res = await request(app)
      .post(`/v1/cases/${CASES.active.id}/stages`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ ...stageBody, court: 'AB' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when case_number is too short', async () => {
    const res = await request(app)
      .post(`/v1/cases/${CASES.active.id}/stages`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ ...stageBody, caseNumber: '1234' });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /v1/stages/:id
// ═══════════════════════════════════════════════════════

describe('PATCH /v1/stages/:id', () => {
  it('admin updates stage', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [STAGES.first], rowCount: 1 })  // lookup
      .mockResolvedValueOnce({ rows: [{ ...STAGES.first, court: 'Новый суд' }], rowCount: 1 });

    const res = await request(app)
      .patch(`/v1/stages/${STAGES.first.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ court: 'Новый суд', updatedAt: NOW });

    expect(res.status).toBe(200);
    expect(res.body.data.court).toBe('Новый суд');
  });

  it('returns 409 STALE_DATA on optimistic lock conflict', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [STAGES.first], rowCount: 1 })  // lookup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })              // UPDATE 0 rows
      .mockResolvedValueOnce({ rows: [{ id: STAGES.first.id }], rowCount: 1 }); // exists

    const res = await request(app)
      .patch(`/v1/stages/${STAGES.first.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ court: 'Conflict', updatedAt: '2000-01-01T00:00:00Z' });

    expect(res.status).toBe(409);
  });

  it('lawyer cannot update stage of other case → 404', async () => {
    const otherStage = { ...STAGES.first, lawyer_id: 'other-id' };
    pool.query.mockResolvedValueOnce({ rows: [otherStage], rowCount: 1 });

    const res = await request(app)
      .patch(`/v1/stages/${STAGES.first.id}`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ court: 'Новый суд', updatedAt: NOW });

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════
// DELETE /v1/stages/:id
// ═══════════════════════════════════════════════════════

describe('DELETE /v1/stages/:id', () => {
  it('admin deletes stage without hearings', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })     // no hearings
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })     // soft delete
      .mockResolvedValueOnce({ rows: [] });                 // audit_log

    const res = await request(app)
      .delete(`/v1/stages/${STAGES.first.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
  });

  it('returns 409 when stage has hearings', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'h1' }], rowCount: 1 });

    const res = await request(app)
      .delete(`/v1/stages/${STAGES.first.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('слушаниями');
  });

  it('lawyer gets 403', async () => {
    const res = await request(app)
      .delete(`/v1/stages/${STAGES.first.id}`)
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════
// RLS: stages follow case ownership
// ═══════════════════════════════════════════════════════

describe('RLS: stages access follows case ownership', () => {
  it('lawyer cannot POST stage to other lawyers case → 404', async () => {
    // assertOwnership returns empty → not owner
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post(`/v1/cases/${CASES.active.id}/stages`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send(stageBody);

    expect(res.status).toBe(404);
  });

  it('admin can POST stage to any case', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                        // existing stages
      .mockResolvedValueOnce({ rows: [STAGES.first], rowCount: 1 })            // INSERT
      .mockResolvedValueOnce({ rows: [] });                                    // audit

    const res = await request(app)
      .post(`/v1/cases/${CASES.active.id}/stages`)
      .set('Authorization', authHeader(USERS.admin))
      .send(stageBody);

    expect(res.status).toBe(201);
  });

  it('viewer cannot create or modify stages → 403', async () => {
    const res = await request(app)
      .patch(`/v1/stages/${STAGES.first.id}`)
      .set('Authorization', authHeader(USERS.viewer))
      .send({ court: 'Hack', updatedAt: NOW });
    expect(res.status).toBe(403);
  });
});
