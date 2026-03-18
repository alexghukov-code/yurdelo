import type { Pool } from 'pg';
import type { Request } from 'express';
import type { RlsPool } from '../middleware/rls.js';

/**
 * Returns the RLS-aware pool if the request is authenticated,
 * otherwise falls back to the raw pool (public endpoints like /health).
 *
 * Usage in route handlers:
 *   const db = getDb(req, pool);
 *   const { rows } = await db.query('SELECT ...');        // RLS applied
 *   const client = await db.connect(); // BEGIN/COMMIT     // RLS applied
 */
export function getDb(req: Request, fallback: Pool): RlsPool | Pool {
  return req.rlsPool ?? fallback;
}
