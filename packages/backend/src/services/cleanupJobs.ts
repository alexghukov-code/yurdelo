import type { Pool } from 'pg';

/**
 * Cleanup cron jobs per TZ §1.3.5:
 *   api_logs    — DELETE WHERE created_at < NOW() - 30 days
 *   auth_events — DELETE WHERE created_at < NOW() - 90 days
 *
 * Runs on a simple setInterval. For production, use BullMQ scheduler
 * or OS-level cron.
 */

const HOUR = 3600_000;

export function startCleanupJobs(db: Pool) {
  // Run immediately once, then every 24 hours
  runCleanup(db);
  const timer = setInterval(() => runCleanup(db), 24 * HOUR);
  // Allow process to exit without waiting for timer
  timer.unref();
  return timer;
}

async function runCleanup(db: Pool) {
  try {
    const { rowCount: logsDeleted } = await db.query(
      `DELETE FROM api_logs WHERE created_at < NOW() - INTERVAL '30 days'`,
    );
    const { rowCount: eventsDeleted } = await db.query(
      `DELETE FROM auth_events WHERE created_at < NOW() - INTERVAL '90 days'`,
    );
    if ((logsDeleted ?? 0) > 0 || (eventsDeleted ?? 0) > 0) {
      console.log(`[cleanup] Deleted ${logsDeleted} api_logs, ${eventsDeleted} auth_events`);
    }
  } catch (err) {
    console.error('[cleanup] Failed:', err);
  }
}

export { runCleanup as _runCleanup };
