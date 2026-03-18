import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, USERS, CASES, authHeader, createMockPool } from './helpers.js';
import { notify, notifyTransfer } from '../services/notificationService.js';

let app: Express;
let pool: ReturnType<typeof buildTestApp>['pool'];

const NOW = new Date().toISOString();

beforeEach(() => {
  const ctx = buildTestApp();
  app = ctx.app;
  pool = ctx.pool;
});

// ═══════════════════════════════════════════════════════
// 1. DEDUP — нет дублей уведомлений
// ═══════════════════════════════════════════════════════

describe('dedup: no duplicate notifications', () => {
  it('creates notification on first call', async () => {
    const mp = createMockPool();
    mp.query
      .mockResolvedValueOnce({ rows: [{ id: 'notif-1' }], rowCount: 1 }); // INSERT ... WHERE NOT EXISTS → inserted

    const id = await notify(mp, null, {
      userId: USERS.lawyer.id,
      type: 'case_transfer_in',
      title: 'Вам передано дело',
      entityType: 'case',
      entityId: 'd0000000-0000-0000-0000-000000000001',
    });

    expect(id).toBe('notif-1');
    expect(mp.query).toHaveBeenCalledTimes(1);
    expect(mp.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining([USERS.lawyer.id, 'case_transfer_in']),
    );
  });

  it('skips insert when same notification exists within 24h', async () => {
    const mp = createMockPool();
    mp.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                    // INSERT returned 0 (WHERE NOT EXISTS matched)
      .mockResolvedValueOnce({ rows: [{ id: 'existing' }], rowCount: 1 }); // SELECT existing

    const id = await notify(mp, null, {
      userId: USERS.lawyer.id,
      type: 'case_transfer_in',
      title: 'Дубль',
      entityType: 'case',
      entityId: 'd0000000-0000-0000-0000-000000000001',
    });

    expect(id).toBe('existing');
    // No second INSERT — only SELECT to fetch existing id
    expect(mp.query).toHaveBeenCalledTimes(2);
    const secondCall = mp.query.mock.calls[1][0] as string;
    expect(secondCall).toContain('SELECT id FROM notifications');
    expect(secondCall).not.toContain('INSERT');
  });

  it('dedup uses INSERT ... WHERE NOT EXISTS (race-condition safe)', async () => {
    const mp = createMockPool();
    mp.query.mockResolvedValueOnce({ rows: [{ id: 'n1' }], rowCount: 1 });

    await notify(mp, null, {
      userId: USERS.lawyer.id,
      type: 'test',
      title: 'Test',
      entityId: 'e1',
    });

    const sql = mp.query.mock.calls[0][0] as string;
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).toContain('INSERT INTO notifications');
    // Single atomic statement — no separate SELECT then INSERT
  });

  it('dedup handles entityId=null correctly (IS NULL check)', async () => {
    const mp = createMockPool();
    mp.query.mockResolvedValueOnce({ rows: [{ id: 'n1' }], rowCount: 1 });

    await notify(mp, null, {
      userId: USERS.lawyer.id,
      type: 'generic',
      title: 'No entity',
      // entityId omitted → null
    });

    const sql = mp.query.mock.calls[0][0] as string;
    // SQL must handle NULL comparison: entity_id IS NULL, not entity_id = NULL
    expect(sql).toContain('entity_id IS NULL');
  });

  it('dedup allows same type for different entityIds', async () => {
    const mp = createMockPool();
    mp.query
      .mockResolvedValueOnce({ rows: [{ id: 'n1' }], rowCount: 1 })  // first entity
      .mockResolvedValueOnce({ rows: [{ id: 'n2' }], rowCount: 1 }); // second entity

    const id1 = await notify(mp, null, {
      userId: USERS.lawyer.id, type: 'hearing_reminder', title: 'A',
      entityId: 'hearing-1',
    });
    const id2 = await notify(mp, null, {
      userId: USERS.lawyer.id, type: 'hearing_reminder', title: 'B',
      entityId: 'hearing-2',
    });

    expect(id1).toBe('n1');
    expect(id2).toBe('n2');
    expect(mp.query).toHaveBeenCalledTimes(2); // Both inserted — different entities
  });

  it('notifyTransfer creates exactly 2 notifications (to + from)', async () => {
    const mp = createMockPool();
    mp.query
      .mockResolvedValueOnce({ rows: [{ id: 'n1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'n2' }], rowCount: 1 });

    await notifyTransfer(mp, null, {
      caseId: CASES.active.id,
      caseName: 'Дело',
      fromId: USERS.lawyer.id,
      fromName: 'Петрова',
      toId: USERS.admin.id,
      toName: 'Иванов',
    });

    expect(mp.query).toHaveBeenCalledTimes(2);
    expect(mp.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([USERS.admin.id, 'case_transfer_in']),
    );
    expect(mp.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([USERS.lawyer.id, 'case_transfer_out']),
    );
  });
});

// ═══════════════════════════════════════════════════════
// 2. EMAIL НЕ ЛОМАЕТ API
// ═══════════════════════════════════════════════════════

describe('email queue: never blocks or breaks API', () => {
  it('notify() succeeds even when emailQueue.add() throws', async () => {
    const mp = createMockPool();
    mp.query.mockResolvedValueOnce({ rows: [{ id: 'n1' }], rowCount: 1 });

    const brokenQueue = {
      add: vi.fn().mockRejectedValue(new Error('Redis connection refused')),
    } as any;

    // Should NOT throw — email failure is swallowed
    const id = await notify(mp, brokenQueue, {
      userId: USERS.lawyer.id,
      type: 'test',
      title: 'Email will fail',
      entityId: 'e1',
    });

    expect(id).toBe('n1'); // Notification was created
    expect(brokenQueue.add).toHaveBeenCalled(); // Attempted
  });

  it('notify() succeeds when emailQueue is null', async () => {
    const mp = createMockPool();
    mp.query.mockResolvedValueOnce({ rows: [{ id: 'n1' }], rowCount: 1 });

    const id = await notify(mp, null, {
      userId: USERS.lawyer.id,
      type: 'test',
      title: 'No queue',
    });

    expect(id).toBe('n1');
  });

  it('transfer API returns 201 even if notifyTransfer fails internally', async () => {
    const toId = 'a0000000-0000-0000-0000-000000000010';
    const client = pool._client;
    const transfer = {
      id: 't1', case_id: CASES.active.id,
      from_id: USERS.lawyer.id, to_id: toId,
      transfer_date: '2026-03-17', comment: null, created_at: NOW,
    };

    client.query
      .mockResolvedValueOnce({ rows: [] })                                           // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: CASES.active.id, name: 'Case', lawyer_id: USERS.lawyer.id, from_last: 'P', from_first: 'M' }] })
      .mockResolvedValueOnce({ rows: [{ id: toId, last_name: 'S', first_name: 'D' }] })
      .mockResolvedValueOnce({ rows: [transfer], rowCount: 1 })                      // INSERT transfer
      .mockResolvedValueOnce({ rows: [] })                                           // UPDATE case
      .mockResolvedValueOnce({ rows: [] })                                           // audit_log
      .mockResolvedValueOnce({ rows: [] });                                          // COMMIT

    // After COMMIT, notifyTransfer fires on pool.query — mock it to fail
    pool.query.mockRejectedValueOnce(new Error('DB down for notifications'));

    const res = await request(app)
      .post('/v1/transfers')
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ caseId: CASES.active.id, toId });

    // API still returns 201 — notification failure is swallowed
    expect(res.status).toBe(201);
  });
});

// ═══════════════════════════════════════════════════════
// 3. ОЧЕРЕДЬ РАБОТАЕТ
// ═══════════════════════════════════════════════════════

describe('email queue: correct job parameters', () => {
  it('enqueues job with attempts=3 and dedup jobId', async () => {
    const mp = createMockPool();
    mp.query.mockResolvedValueOnce({ rows: [{ id: 'n1' }], rowCount: 1 });

    const mockQueue = { add: vi.fn().mockResolvedValue({}) } as any;

    await notify(mp, mockQueue, {
      userId: USERS.lawyer.id,
      type: 'hearing_reminder',
      title: 'Заседание завтра',
      message: 'Текст',
      entityType: 'hearing',
      entityId: 'h1',
    });

    expect(mockQueue.add).toHaveBeenCalledTimes(1);

    const [jobName, jobData, jobOpts] = mockQueue.add.mock.calls[0];
    expect(jobName).toBe('send-email');
    expect(jobData).toEqual({
      notificationId: 'n1',
      userId: USERS.lawyer.id,
      title: 'Заседание завтра',
      message: 'Текст',
    });
    expect(jobOpts.attempts).toBe(3);
    expect(jobOpts.removeOnComplete).toBe(true);
    expect(jobOpts.removeOnFail).toBe(false);
    expect(typeof jobOpts.jobId).toBe('string');
    expect(jobOpts.jobId.length).toBe(32); // sha256 truncated
  });

  it('same notification params produce same jobId (BullMQ dedup)', async () => {
    const mp = createMockPool();
    mp.query.mockResolvedValue({ rows: [{ id: 'n1' }], rowCount: 1 });

    const mockQueue = { add: vi.fn().mockResolvedValue({}) } as any;
    const params = {
      userId: USERS.lawyer.id,
      type: 'case_transfer_in',
      title: 'Test',
      entityId: 'e1',
    };

    await notify(mp, mockQueue, params);
    await notify(mp, mockQueue, params);

    const jobId1 = mockQueue.add.mock.calls[0][2].jobId;
    const jobId2 = mockQueue.add.mock.calls[1][2].jobId;
    expect(jobId1).toBe(jobId2); // Same dedup key → BullMQ ignores second add
  });

  it('different entityIds produce different jobIds', async () => {
    const mp = createMockPool();
    mp.query.mockResolvedValue({ rows: [{ id: 'n1' }], rowCount: 1 });

    const mockQueue = { add: vi.fn().mockResolvedValue({}) } as any;

    await notify(mp, mockQueue, {
      userId: USERS.lawyer.id, type: 'test', title: 'A', entityId: 'e1',
    });
    await notify(mp, mockQueue, {
      userId: USERS.lawyer.id, type: 'test', title: 'B', entityId: 'e2',
    });

    const jobId1 = mockQueue.add.mock.calls[0][2].jobId;
    const jobId2 = mockQueue.add.mock.calls[1][2].jobId;
    expect(jobId1).not.toBe(jobId2);
  });

  it('does not enqueue email on dedup hit', async () => {
    const mp = createMockPool();
    mp.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                    // INSERT → 0 rows (dedup)
      .mockResolvedValueOnce({ rows: [{ id: 'existing' }], rowCount: 1 }); // SELECT existing

    const mockQueue = { add: vi.fn().mockResolvedValue({}) } as any;

    await notify(mp, mockQueue, {
      userId: USERS.lawyer.id,
      type: 'test',
      title: 'Dup',
      entityId: 'e1',
    });

    // Queue should NOT be called — notification already existed
    expect(mockQueue.add).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════
// 4. API endpoints
// ═══════════════════════════════════════════════════════

describe('GET /v1/notifications', () => {
  const mockNotif = {
    id: 'n1', type: 'case_transfer_in', title: 'Вам передано дело',
    message: 'Текст', link: '/cases/1',
    entity_type: 'case', entity_id: CASES.active.id,
    is_read: false, created_at: NOW,
  };

  it('returns notifications + unread count', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [mockNotif], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] });

    const res = await request(app)
      .get('/v1/notifications')
      .set('Authorization', authHeader(USERS.lawyer));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isRead).toBe(false);
    expect(res.body.meta.unreadCount).toBe(1);
  });

  it('filters by is_read', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    await request(app)
      .get('/v1/notifications?is_read=false')
      .set('Authorization', authHeader(USERS.lawyer));

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('is_read = false'),
      expect.any(Array),
    );
  });

  it('401 without auth', async () => {
    const res = await request(app).get('/v1/notifications');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /v1/notifications/:id/read', () => {
  it('marks as read', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .patch('/v1/notifications/n1/read')
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.status).toBe(200);
  });

  it('idempotent — already read returns 200', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'n1' }], rowCount: 1 });
    const res = await request(app)
      .patch('/v1/notifications/n1/read')
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.status).toBe(200);
  });

  it('404 for other users notification', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .patch('/v1/notifications/n1/read')
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/notifications/read-all', () => {
  it('marks all and returns count', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 5 });
    const res = await request(app)
      .patch('/v1/notifications/read-all')
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.body.data.updated).toBe(5);
  });

  it('returns 0 when none unread', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .patch('/v1/notifications/read-all')
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.body.data.updated).toBe(0);
  });
});
