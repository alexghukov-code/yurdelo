import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import '../types.js';

/**
 * Logs every API request to the api_logs table.
 * TZ §1.3.5: method, URL, status, response_time_ms, userId, IP.
 *
 * Fire-and-forget INSERT — never blocks the response.
 */
export function createApiLogger(db: Pool | null): RequestHandler {
  return (req, res, next) => {
    if (!db) return next();

    const start = Date.now();

    res.on('finish', () => {
      const ms = Date.now() - start;
      db.query(
        `INSERT INTO api_logs (method, url, status_code, response_time_ms, user_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.method,
          req.originalUrl?.slice(0, 500) ?? req.url,
          res.statusCode,
          ms,
          req.user?.id ?? null,
          req.ip ?? null,
          (req.headers['user-agent'] as string)?.slice(0, 500) ?? null,
        ],
      ).catch(() => {}); // never fail the request
    });

    next();
  };
}
