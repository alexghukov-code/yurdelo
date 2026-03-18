import { Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

const startedAt = Date.now();

export function healthRouter(deps: { db: Pool; redis: Redis }) {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const checks = { db: 'connected', redis: 'connected' };
    let status = 'ok';
    let httpCode = 200;

    try {
      await deps.db.query('SELECT 1');
    } catch {
      checks.db = 'error';
      status = 'degraded';
      httpCode = 503;
    }

    try {
      await deps.redis.ping();
    } catch {
      checks.redis = 'error';
      status = 'degraded';
      httpCode = 503;
    }

    res.status(httpCode).json({
      status,
      db: checks.db,
      redis: checks.redis,
      version: '2.1.0',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  return router;
}
