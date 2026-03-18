import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, USERS, CASES, STAGES, HEARINGS, authHeader } from './helpers.js';

let app: Express;
let pool: ReturnType<typeof buildTestApp>['pool'];

const NOW = new Date().toISOString();

beforeEach(() => {
  const ctx = buildTestApp();
  app = ctx.app;
  pool = ctx.pool;
});

// ═══════════════════════════════════════════════════════
// POST /v1/stages/:stageId/hearings
// ═══════════════════════════════════════════════════════

describe('POST /v1/stages/:stageId/hearings', () => {
  it('creates hearing (201)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ case_id: 'd1', lawyer_id: USERS.lawyer.id }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [HEARINGS.scheduled], rowCount: 1 }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // audit_log

    const res = await request(app)
      .post(`/v1/stages/${STAGES.first.id}/hearings`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ type: 'hearing', datetime: '2026-04-15T10:00:00Z' });

    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('hearing');
  });

  it('returns suggestion when type=result', async () => {
    const resultHearing = { ...HEARINGS.scheduled, type: 'result', result: 'win' };
    pool.query
      .mockResolvedValueOnce({ rows: [{ case_id: 'd1', lawyer_id: USERS.lawyer.id }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [resultHearing], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post(`/v1/stages/${STAGES.first.id}/hearings`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ type: 'result', datetime: '2026-04-15T10:00:00Z', result: 'win' });

    expect(res.status).toBe(201);
    expect(res.body.suggestion.suggestedFinalResult).toBe('win');
  });

  it('returns 400 when type=result but result is missing', async () => {
    const res = await request(app)
      .post(`/v1/stages/${STAGES.first.id}/hearings`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ type: 'result', datetime: '2026-04-15T10:00:00Z' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'result' })]),
    );
  });

  it('returns 400 when type=adj but newDatetime is missing (edge case)', async () => {
    const res = await request(app)
      .post(`/v1/stages/${STAGES.first.id}/hearings`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ type: 'adj', datetime: '2026-04-15T10:00:00Z' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'newDatetime' })]),
    );
  });

  it('returns 400 when appealed is set on non-result type', async () => {
    const res = await request(app)
      .post(`/v1/stages/${STAGES.first.id}/hearings`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ type: 'hearing', datetime: '2026-04-15T10:00:00Z', appealed: true });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'appealed' })]),
    );
  });

  it('viewer gets 403', async () => {
    const res = await request(app)
      .post(`/v1/stages/${STAGES.first.id}/hearings`)
      .set('Authorization', authHeader(USERS.viewer))
      .send({ type: 'hearing', datetime: '2026-04-15T10:00:00Z' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when stage does not exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/v1/stages/00000000-0000-0000-0000-000000000000/hearings')
      .set('Authorization', authHeader(USERS.admin))
      .send({ type: 'hearing', datetime: '2026-04-15T10:00:00Z' });

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /v1/hearings/:id
// ═══════════════════════════════════════════════════════

describe('PATCH /v1/hearings/:id', () => {
  it('updates hearing', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [HEARINGS.scheduled], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ ...HEARINGS.scheduled, notes: 'Заметка' }], rowCount: 1 });

    const res = await request(app)
      .patch(`/v1/hearings/${HEARINGS.scheduled.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ notes: 'Заметка', updatedAt: NOW });

    expect(res.status).toBe(200);
    expect(res.body.data.notes).toBe('Заметка');
  });

  it('returns 409 on optimistic lock conflict', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [HEARINGS.scheduled], rowCount: 1 }) // lookup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                  // UPDATE 0
      .mockResolvedValueOnce({ rows: [{ id: HEARINGS.scheduled.id }], rowCount: 1 }); // exists

    const res = await request(app)
      .patch(`/v1/hearings/${HEARINGS.scheduled.id}`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ notes: 'Stale', updatedAt: '2000-01-01T00:00:00Z' });

    expect(res.status).toBe(409);
  });

  it('lawyer cannot update hearing in others case → 404', async () => {
    const other = { ...HEARINGS.scheduled, lawyer_id: 'other-id' };
    pool.query.mockResolvedValueOnce({ rows: [other], rowCount: 1 });

    const res = await request(app)
      .patch(`/v1/hearings/${HEARINGS.scheduled.id}`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ notes: 'Hack', updatedAt: NOW });

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════
// DELETE /v1/hearings/:id
// ═══════════════════════════════════════════════════════

describe('DELETE /v1/hearings/:id', () => {
  it('admin soft-deletes hearing and marks documents', async () => {
    const client = pool._client;
    client.query
      .mockResolvedValueOnce({ rows: [] })                    // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })       // soft delete hearing
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })       // mark documents
      .mockResolvedValueOnce({ rows: [] })                    // audit_log
      .mockResolvedValueOnce({ rows: [] });                   // COMMIT

    const res = await request(app)
      .delete(`/v1/hearings/${HEARINGS.scheduled.id}`)
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    // Verify documents were marked
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE documents'),
      expect.arrayContaining([HEARINGS.scheduled.id]),
    );
  });

  it('lawyer gets 403', async () => {
    const res = await request(app)
      .delete(`/v1/hearings/${HEARINGS.scheduled.id}`)
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════
// RLS: hearings follow case ownership via stage
// ═══════════════════════════════════════════════════════

describe('RLS: hearings access follows case ownership', () => {
  it('lawyer cannot create hearing in other lawyers stage → 404', async () => {
    const otherCtx = { case_id: 'd1', lawyer_id: 'other-lawyer' };
    pool.query.mockResolvedValueOnce({ rows: [otherCtx], rowCount: 1 });

    const res = await request(app)
      .post(`/v1/stages/${STAGES.first.id}/hearings`)
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ type: 'hearing', datetime: '2026-04-15T10:00:00Z' });

    expect(res.status).toBe(404);
  });

  it('admin can create hearing in any stage', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ case_id: 'd1', lawyer_id: 'anyone' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [HEARINGS.scheduled], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post(`/v1/stages/${STAGES.first.id}/hearings`)
      .set('Authorization', authHeader(USERS.admin))
      .send({ type: 'hearing', datetime: '2026-04-15T10:00:00Z' });

    expect(res.status).toBe(201);
  });

  it('viewer cannot create or modify hearings → 403', async () => {
    const res = await request(app)
      .patch(`/v1/hearings/${HEARINGS.scheduled.id}`)
      .set('Authorization', authHeader(USERS.viewer))
      .send({ notes: 'Hack', updatedAt: NOW });
    expect(res.status).toBe(403);
  });

  it('stages/hearings hidden when lawyer cannot access case (GET /cases/:id)', async () => {
    // Case belongs to another lawyer → 404 (stages/hearings never exposed)
    const otherCase = { ...CASES.active, lawyer_id: 'other-lawyer-id' };
    pool.query.mockResolvedValueOnce({ rows: [otherCase], rowCount: 1 });

    const res = await request(app)
      .get(`/v1/cases/${CASES.active.id}`)
      .set('Authorization', authHeader(USERS.lawyer));

    expect(res.status).toBe(404);
    // No stages/hearings leaked
    expect(res.body.data?.stages).toBeUndefined();
  });
});
