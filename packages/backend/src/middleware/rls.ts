import type { RequestHandler } from 'express';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import '../types.js';

/**
 * RLS middleware: wraps the DB pool so that EVERY query within a request
 * runs set_config in the SAME connection before executing.
 *
 * Problem with naive approach:
 *   middleware: pool.query(set_config) → connection A → returned to pool
 *   handler:   pool.query(SELECT)     → connection B → RLS vars are NULL
 *
 * Solution: replace req-scoped `db` with a proxy that:
 *   - For pool.query(): checks out a client, sets RLS, runs query, releases
 *   - For pool.connect(): checks out a client, sets RLS, returns it
 *
 * This ensures set_config and the actual query share the SAME connection.
 */

export interface RlsPool {
  query(text: string, params?: unknown[]): Promise<QueryResult<any>>;
  connect(): Promise<PoolClient>;
}

export function createRlsMiddleware(pool: Pool | null): RequestHandler {
  return (req, res, next) => {
    if (!pool || !req.user) return next();

    const userId = req.user.id;
    const userRole = req.user.role;

    // Replace req.db with RLS-aware proxy
    (req as any).rlsPool = createRlsProxy(pool, userId, userRole);

    next();
  };
}

function createRlsProxy(pool: Pool, userId: string, userRole: string): RlsPool {
  return {
    /**
     * Single query: checkout → set_config → query → release.
     * All three happen on the SAME connection.
     */
    async query(text: string, params?: unknown[]): Promise<QueryResult<any>> {
      const client = await pool.connect();
      try {
        await setRlsContext(client, userId, userRole);
        return await client.query(text, params);
      } finally {
        // Reset config before returning to pool (prevent leaking to next request)
        await resetRlsContext(client).catch(() => {});
        client.release();
      }
    },

    /**
     * Transaction: checkout → set_config → return client.
     * Caller is responsible for BEGIN/COMMIT/ROLLBACK and release().
     * RLS context is set ONCE before caller gets the client.
     */
    async connect(): Promise<PoolClient> {
      const client = await pool.connect();
      await setRlsContext(client, userId, userRole);

      // Wrap release to reset context before returning to pool
      const originalRelease = client.release.bind(client);
      client.release = async () => {
        await resetRlsContext(client).catch(() => {});
        originalRelease();
      };

      return client;
    },
  };
}

async function setRlsContext(client: PoolClient, userId: string, role: string) {
  await client.query(`SELECT set_config('app.current_user_id', $1, false)`, [userId]);
  await client.query(`SELECT set_config('app.current_user_role', $1, false)`, [role]);
}

async function resetRlsContext(client: PoolClient) {
  await client
    .query(`RESET app.current_user_id`)
    .catch(() => client.query(`SELECT set_config('app.current_user_id', '', false)`));
  await client
    .query(`RESET app.current_user_role`)
    .catch(() => client.query(`SELECT set_config('app.current_user_role', '', false)`));
}
