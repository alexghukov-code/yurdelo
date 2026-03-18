import type { RequestHandler } from 'express';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import '../types.js';

/**
 * RLS middleware: sets up a lazy RLS proxy on req.rlsPool.
 *
 * The proxy is created on first access (not immediately), because
 * requireAuth runs AFTER this middleware and sets req.user.
 *
 * Flow:
 *   1. RLS middleware: defines lazy getter on req.rlsPool
 *   2. requireAuth: sets req.user = { id, role, email }
 *   3. Route handler: calls getDb(req, rawDb) → accesses req.rlsPool
 *   4. Getter fires: creates RLS proxy using req.user (now available)
 */

export interface RlsPool {
  query(text: string, params?: unknown[]): Promise<QueryResult<any>>;
  connect(): Promise<PoolClient>;
}

export function createRlsMiddleware(pool: Pool | null): RequestHandler {
  return (req, res, next) => {
    if (!pool) return next();

    let cached: RlsPool | undefined;

    Object.defineProperty(req, 'rlsPool', {
      get() {
        if (cached) return cached;
        if (!req.user) return undefined;
        cached = createRlsProxy(pool, req.user.id, req.user.role);
        return cached;
      },
      configurable: true,
      enumerable: true,
    });

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
