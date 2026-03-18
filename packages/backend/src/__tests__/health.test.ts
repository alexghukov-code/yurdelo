import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { healthRouter } from '../routes/health.js';

function mockDeps(overrides?: { dbFail?: boolean; redisFail?: boolean }) {
  return {
    db: {
      query: overrides?.dbFail
        ? vi.fn().mockRejectedValue(new Error('db down'))
        : vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    } as any,
    redis: {
      ping: overrides?.redisFail
        ? vi.fn().mockRejectedValue(new Error('redis down'))
        : vi.fn().mockResolvedValue('PONG'),
    } as any,
  };
}

function createTestApp(overrides?: { dbFail?: boolean; redisFail?: boolean }) {
  const app = express();
  app.use(healthRouter(mockDeps(overrides)));
  return app;
}

describe('GET /health', () => {
  it('returns 200 when all services are up', async () => {
    const res = await request(createTestApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(res.body.redis).toBe('connected');
    expect(res.body.version).toBe('2.1.0');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('returns 503 when database is down', async () => {
    const res = await request(createTestApp({ dbFail: true })).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db).toBe('error');
    expect(res.body.redis).toBe('connected');
  });

  it('returns 503 when redis is down', async () => {
    const res = await request(createTestApp({ redisFail: true })).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.redis).toBe('error');
  });
});
