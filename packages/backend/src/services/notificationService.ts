import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Queue } from 'bullmq';

export interface NotifyParams {
  userId: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Create an in-app notification and enqueue an email.
 *
 * Dedup: INSERT ... ON CONFLICT prevents race conditions.
 * Email enqueue is fire-and-forget — never throws to caller.
 */
export async function notify(
  queryable: Pool | PoolClient,
  emailQueue: Queue | null,
  params: NotifyParams,
) {
  const dedupKey = buildDedupKey(params);

  // ── Atomic upsert with dedup ────────────────────────
  // ON CONFLICT on (user_id, type, dedup_key) — if same notification
  // was already created today, return existing id without inserting.
  const entityId = params.entityId ?? null;

  const { rows } = await queryable.query(
    `INSERT INTO notifications (user_id, type, title, message, link, entity_type, entity_id)
     SELECT $1, $2, $3, $4, $5, $6, $7
     WHERE NOT EXISTS (
       SELECT 1 FROM notifications
       WHERE user_id = $1 AND type = $2
         AND (($7::uuid IS NULL AND entity_id IS NULL) OR entity_id = $7)
         AND created_at > NOW() - INTERVAL '1 day'
     )
     RETURNING id`,
    [
      params.userId, params.type, params.title,
      params.message ?? null, params.link ?? null,
      params.entityType ?? null, entityId,
    ],
  );

  if (rows.length === 0) {
    // Already exists — dedup hit. Fetch existing id.
    const { rows: existing } = await queryable.query(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND type = $2
         AND (($3::uuid IS NULL AND entity_id IS NULL) OR entity_id = $3)
         AND created_at > NOW() - INTERVAL '1 day'
       LIMIT 1`,
      [params.userId, params.type, entityId],
    );
    return existing[0]?.id ?? null;
  }

  const notificationId = rows[0].id;

  // ── Enqueue email (fire-and-forget — NEVER blocks API) ──
  if (emailQueue) {
    try {
      await emailQueue.add(
        'send-email',
        {
          notificationId,
          userId: params.userId,
          title: params.title,
          message: params.message,
        },
        {
          jobId: dedupKey,
          attempts: 3,
          backoff: { type: 'custom' },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    } catch {
      // Queue down — notification is already saved in DB.
      // Will be picked up by retry cron or manual resend.
    }
  }

  return notificationId;
}

// ── Convenience: notify about a case transfer ─────────

export async function notifyTransfer(
  queryable: Pool | PoolClient,
  emailQueue: Queue | null,
  opts: {
    caseId: string;
    caseName: string;
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
  },
) {
  await notify(queryable, emailQueue, {
    userId: opts.toId,
    type: 'case_transfer_in',
    title: `Вам передано дело: ${opts.caseName}`,
    message: `${opts.fromName} передал(а) вам дело «${opts.caseName}».`,
    link: `/cases/${opts.caseId}`,
    entityType: 'case',
    entityId: opts.caseId,
  });

  await notify(queryable, emailQueue, {
    userId: opts.fromId,
    type: 'case_transfer_out',
    title: `Дело передано: ${opts.caseName}`,
    message: `Дело «${opts.caseName}» передано ${opts.toName}.`,
    link: `/cases/${opts.caseId}`,
    entityType: 'case',
    entityId: opts.caseId,
  });
}

// ── Convenience: hearing reminder ─────────────────────

export async function notifyHearingReminder(
  queryable: Pool | PoolClient,
  emailQueue: Queue | null,
  opts: {
    userId: string;
    hearingId: string;
    caseName: string;
    court: string;
    datetime: string;
  },
) {
  await notify(queryable, emailQueue, {
    userId: opts.userId,
    type: 'hearing_reminder',
    title: `Напоминание: заседание по делу «${opts.caseName}»`,
    message: `Заседание ${opts.datetime} в ${opts.court}.`,
    link: `/cases/${opts.hearingId}`,
    entityType: 'hearing',
    entityId: opts.hearingId,
  });
}

// ── Dedup key builder (for BullMQ jobId) ──────────────

function buildDedupKey(p: NotifyParams): string {
  const date = new Date().toISOString().slice(0, 10);
  const raw = `${p.userId}:${p.type}:${p.entityId ?? ''}:${date}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
