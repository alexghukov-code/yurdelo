/**
 * Tests for P0 middleware: rate limiter, RLS, API logger, cleanup crons.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { createRlsMiddleware } from '../middleware/rls.js';
import { createApiLogger } from '../middleware/apiLogger.js';
import { _runCleanup } from '../services/cleanupJobs.js';
import { createMockRedis, createMockPool, USERS, authHeader, buildTestApp } from './helpers.js';
import { createApp } from '../app.js';

// ═══════════════════════════════════════════════════════
// C2: Rate Limiting
// ═══════════════════════════════════════════════════════

describe('Rate limiter middleware', () => {
  it('allows requests under the limit', async () => {
    const redis = createMockRedis();
    const app = express();
    app.use(createRateLimiter(redis as any));
    app.get('/v1/cases', (_req, res) => res.json({ ok: true }));

    // incr returns 1 (under limit of 100)
    redis.incr.mockResolvedValue(1);

    const res = await request(app).get('/v1/cases');
    expect(res.status).toBe(200);
  });

  it('returns 429 when global limit exceeded (>100 req/min)', async () => {
    const redis = createMockRedis();
    const app = express();
    app.use(createRateLimiter(redis as any));
    app.use((_err: any, _req: any, res: any, _next: any) => {
      res.status(_err.statusCode ?? 500).json({ error: { code: _err.code } });
    });
    app.get('/v1/cases', (_req, res) => res.json({ ok: true }));

    // First incr = burst check (ok), second incr = global check (over limit)
    redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(101);

    const res = await request(app).get('/v1/cases');
    expect(res.status).toBe(429);
  });

  it('returns 429 when burst limit exceeded (>20 req/sec)', async () => {
    const redis = createMockRedis();
    const app = express();
    app.use(createRateLimiter(redis as any));
    app.use((_err: any, _req: any, res: any, _next: any) => {
      res.status(_err.statusCode ?? 500).json({ error: { code: _err.code } });
    });
    app.get('/v1/cases', (_req, res) => res.json({ ok: true }));

    // Global ok (1), burst over (21)
    redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(21);

    const res = await request(app).get('/v1/cases');
    expect(res.status).toBe(429);
  });

  it('sets expire on first increment', async () => {
    const redis = createMockRedis();
    const app = express();
    app.use(createRateLimiter(redis as any));
    app.get('/v1/cases', (_req, res) => res.json({ ok: true }));

    redis.incr.mockResolvedValue(1); // count=1 → first request

    await request(app).get('/v1/cases');
    expect(redis.expire).toHaveBeenCalled();
  });

  it('does nothing when redis is null (tests)', async () => {
    const app = express();
    app.use(createRateLimiter(null as any));
    app.get('/v1/cases', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/v1/cases');
    expect(res.status).toBe(200);
  });

  it('uses IP key for /auth/login (not user_id)', async () => {
    const redis = createMockRedis();
    const app = express();
    app.use(createRateLimiter(redis as any));
    app.use((_err: any, _req: any, res: any, _next: any) => {
      res.status(_err.statusCode ?? 500).json({});
    });
    app.post('/v1/auth/login', (_req, res) => res.json({ ok: true }));

    redis.incr.mockResolvedValue(1);

    await request(app).post('/v1/auth/login');

    // Key should contain "rl:login" (IP-based, not user-based)
    const incrCalls = redis.incr.mock.calls.map((c: any) => c[0]);
    expect(incrCalls.some((k: string) => k.startsWith('rl:login:'))).toBe(true);
  });

  it('429 response includes Retry-After header (global limit)', async () => {
    const redis = createMockRedis();
    const app = express();
    app.use(createRateLimiter(redis as any));
    app.get('/v1/cases', (_req, res) => res.json({ ok: true }));
    // Use the REAL errorHandler to check Retry-After
    const { errorHandler } = await import('../middleware/errorHandler.js');
    app.use(errorHandler);

    // Global over limit (101 > 100), burst ok (1)
    redis.incr.mockResolvedValueOnce(101);

    const res = await request(app).get('/v1/cases');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('429 response includes Retry-After header (burst limit)', async () => {
    const redis = createMockRedis();
    const app = express();
    app.use(createRateLimiter(redis as any));
    app.get('/v1/cases', (_req, res) => res.json({ ok: true }));
    const { errorHandler } = await import('../middleware/errorHandler.js');
    app.use(errorHandler);

    // Global ok (1), burst over (21 > 20) — 1 sec window
    redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(21);

    const res = await request(app).get('/v1/cases');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('1');
  });

  it('429 on /auth/login after 10 requests (IP-based)', async () => {
    const redis = createMockRedis();
    const app = express();
    app.use(createRateLimiter(redis as any));
    app.post('/v1/auth/login', (_req, res) => res.json({ ok: true }));
    const { errorHandler } = await import('../middleware/errorHandler.js');
    app.use(errorHandler);

    // Login rule: 11 > 10, burst ok
    redis.incr.mockResolvedValueOnce(11).mockResolvedValueOnce(1);

    const res = await request(app).post('/v1/auth/login');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
  });

  it('429 on /documents upload after 10 requests', async () => {
    const redis = createMockRedis();
    const app = express();
    app.use(createRateLimiter(redis as any));
    app.post('/v1/hearings/h1/documents', (_req, res) => res.json({ ok: true }));
    const { errorHandler } = await import('../middleware/errorHandler.js');
    app.use(errorHandler);

    // Upload rule: 11 > 10, burst ok
    redis.incr.mockResolvedValueOnce(11).mockResolvedValueOnce(1);

    const res = await request(app).post('/v1/hearings/h1/documents');
    expect(res.status).toBe(429);
  });
});

// ═══════════════════════════════════════════════════════
// C3: RLS set_config
// ═══════════════════════════════════════════════════════

describe('RLS middleware', () => {
  it('attaches rlsPool to req when user is present', async () => {
    const pool = createMockPool();
    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { id: USERS.admin.id, role: 'admin', email: 'a@b.c' };
      next();
    });
    app.use(createRlsMiddleware(pool as any));
    app.get('/test', (req, res) => {
      // rlsPool should be attached
      res.json({ hasRlsPool: !!(req as any).rlsPool });
    });

    const res = await request(app).get('/test');
    expect(res.body.hasRlsPool).toBe(true);
  });

  it('rlsPool.query() calls set_config in SAME connection as query', async () => {
    const pool = createMockPool();
    const mockClient = pool._client;
    mockClient.query.mockResolvedValue({ rows: [{ id: '1' }], rowCount: 1 });

    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { id: USERS.admin.id, role: 'admin', email: 'a@b.c' };
      next();
    });
    app.use(createRlsMiddleware(pool as any));
    app.get('/test', async (req, res) => {
      const result = await (req as any).rlsPool.query('SELECT * FROM cases');
      res.json(result.rows);
    });

    await request(app).get('/test');

    // All calls go through the SAME client (not pool.query)
    const calls = mockClient.query.mock.calls.map((c: any) => c[0]);
    expect(calls).toContain(`SELECT set_config('app.current_user_id', $1, false)`);
    expect(calls).toContain(`SELECT set_config('app.current_user_role', $1, false)`);
    expect(calls).toContain('SELECT * FROM cases');
    // Client was released after query
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('rlsPool.connect() sets RLS context on checkout client', async () => {
    const pool = createMockPool();
    const mockClient = pool._client;
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { id: USERS.lawyer.id, role: 'lawyer', email: 'l@b.c' };
      next();
    });
    app.use(createRlsMiddleware(pool as any));
    app.get('/test', async (req, res) => {
      const client = await (req as any).rlsPool.connect();
      await client.query('BEGIN');
      await client.query('SELECT * FROM cases');
      await client.query('COMMIT');
      client.release();
      res.json({ ok: true });
    });

    await request(app).get('/test');

    const calls = mockClient.query.mock.calls.map((c: any) => c[0]);
    // set_config BEFORE begin
    const setConfigIdx = calls.indexOf(`SELECT set_config('app.current_user_id', $1, false)`);
    const beginIdx = calls.indexOf('BEGIN');
    expect(setConfigIdx).toBeLessThan(beginIdx);
    expect(setConfigIdx).toBeGreaterThanOrEqual(0);
  });

  it('skips when no user (unauthenticated)', async () => {
    const pool = createMockPool();
    const app = express();
    app.use(createRlsMiddleware(pool as any));
    app.get('/test', (req, res) => {
      res.json({ hasRlsPool: !!(req as any).rlsPool });
    });

    const res = await request(app).get('/test');
    expect(res.body.hasRlsPool).toBe(false);
  });

  it('skips when db is null', async () => {
    const app = express();
    app.use(createRlsMiddleware(null as any));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════
// C4: API Logger
// ═══════════════════════════════════════════════════════

describe('API logger middleware', () => {
  it('inserts log entry after response', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { id: USERS.lawyer.id };
      next();
    });
    app.use(createApiLogger(pool as any));
    app.get('/v1/cases', (_req, res) => res.json({ ok: true }));

    await request(app).get('/v1/cases');

    // Wait for fire-and-forget INSERT
    await new Promise((r) => setTimeout(r, 50));

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO api_logs'),
      expect.arrayContaining(['GET', '/v1/cases', 200]),
    );
  });

  it('logs response time in ms', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

    const app = express();
    app.use(createApiLogger(pool as any));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    await request(app).get('/test');
    await new Promise((r) => setTimeout(r, 50));

    const params = pool.query.mock.calls[0]?.[1] as any[];
    // response_time_ms is the 4th param
    expect(typeof params[3]).toBe('number');
    expect(params[3]).toBeGreaterThanOrEqual(0);
  });

  it('never blocks response on INSERT failure', async () => {
    const pool = createMockPool();
    pool.query.mockRejectedValue(new Error('DB down'));

    const app = express();
    app.use(createApiLogger(pool as any));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200); // response succeeded despite logger failure
  });

  it('skips when db is null', async () => {
    const app = express();
    app.use(createApiLogger(null as any));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════
// C5: Cleanup cron jobs
// ═══════════════════════════════════════════════════════

describe('Cleanup jobs', () => {
  it('deletes api_logs older than 30 days', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rows: [], rowCount: 5 });

    await _runCleanup(pool as any);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM api_logs WHERE created_at < NOW() - INTERVAL '30 days'"),
    );
  });

  it('deletes auth_events older than 90 days', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

    await _runCleanup(pool as any);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM auth_events WHERE created_at < NOW() - INTERVAL '90 days'"),
    );
  });

  it('does not crash on DB error', async () => {
    const pool = createMockPool();
    pool.query.mockRejectedValue(new Error('DB gone'));

    // Should not throw
    await expect(_runCleanup(pool as any)).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════
// Integration: middleware in app pipeline
// ═══════════════════════════════════════════════════════

describe('Middleware wired in app.ts', () => {
  it('rate limiter is enabled by default (not in test helper)', async () => {
    const pool = createMockPool();
    const redis = createMockRedis();
    redis.incr.mockResolvedValue(1);
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

    const { app } = createApp({
      db: pool as any,
      redis: redis as any,
      emailQueue: null,
      // NOT disabling rate limiter
      disableApiLogger: true,
    });

    await request(app)
      .get('/v1/cases')
      .set('Authorization', authHeader(USERS.admin));

    // Rate limiter should have called redis.incr
    expect(redis.incr).toHaveBeenCalled();
  });

  it('api logger is enabled by default', async () => {
    const pool = createMockPool();
    const redis = createMockRedis();
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

    const { app } = createApp({
      db: pool as any,
      redis: redis as any,
      emailQueue: null,
      disableRateLimit: true,
      // NOT disabling api logger
    });

    await request(app)
      .get('/v1/cases')
      .set('Authorization', authHeader(USERS.admin));

    await new Promise((r) => setTimeout(r, 50));

    // API logger should have inserted into api_logs
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO api_logs'),
      expect.any(Array),
    );
  });
});
