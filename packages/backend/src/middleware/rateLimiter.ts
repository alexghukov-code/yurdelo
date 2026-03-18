import type { RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { AppError } from '../utils/errors.js';
import '../types.js';

/**
 * Rate limiting via Redis sliding window counter.
 * TZ §1.3.3:
 *   /auth/login          — 10 req / 1 min per IP
 *   All /auth/*           — 20 req / 1 min per IP
 *   All other API         — 100 req / 1 min per user_id
 *   Upload /documents     — 10 req / 1 min per user_id
 *   Burst (all API)       — 20 req / 1 sec per user_id
 */

interface LimitRule {
  max: number;
  windowSec: number;
  keyPrefix: string;
  keyFn: (req: any) => string;
}

const RULES: Array<{ match: (method: string, path: string) => boolean; rule: LimitRule }> = [
  {
    match: (m, p) => m === 'POST' && p === '/v1/auth/login',
    rule: { max: 10, windowSec: 60, keyPrefix: 'rl:login', keyFn: (req) => req.ip ?? 'unknown' },
  },
  {
    match: (_m, p) => p.startsWith('/v1/auth/'),
    rule: { max: 20, windowSec: 60, keyPrefix: 'rl:auth', keyFn: (req) => req.ip ?? 'unknown' },
  },
  {
    match: (m, p) => m === 'POST' && p.includes('/documents'),
    rule: { max: 10, windowSec: 60, keyPrefix: 'rl:upload', keyFn: (req) => req.user?.id ?? req.ip },
  },
];

const GLOBAL_RULE: LimitRule = {
  max: 100, windowSec: 60, keyPrefix: 'rl:global', keyFn: (req) => req.user?.id ?? req.ip,
};

const BURST_RULE: LimitRule = {
  max: 20, windowSec: 1, keyPrefix: 'rl:burst', keyFn: (req) => req.user?.id ?? req.ip,
};

export function createRateLimiter(redis: Redis | null): RequestHandler {
  return async (req, _res, next) => {
    if (!redis) return next(); // disabled in tests

    const method = req.method;
    const path = req.path;

    // Find specific rule
    const specific = RULES.find((r) => r.match(method, path));
    const rule = specific?.rule ?? GLOBAL_RULE;

    try {
      await checkLimit(redis, rule, req);
      await checkLimit(redis, BURST_RULE, req);
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function checkLimit(redis: Redis, rule: LimitRule, req: any): Promise<void> {
  const key = `${rule.keyPrefix}:${rule.keyFn(req)}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, rule.windowSec);
  }
  if (count > rule.max) {
    throw AppError.rateLimited(rule.windowSec);
  }
}
