import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import type { Pool } from 'pg';

// Retry delays per TZ: 1 min → 5 min → 15 min
const RETRY_DELAYS = [60_000, 300_000, 900_000];

export interface EmailJobData {
  notificationId: string;
  userId: string;
  title: string;
  message?: string;
}

/**
 * Creates a BullMQ worker that processes email-notification jobs.
 *
 * In production, `sendEmail` would call the UniSender API.
 * On all 3 failures → write to `failed_notifications` + alert Sentry.
 */
export function createEmailWorker(
  connection: ConnectionOptions,
  db: Pool,
  sendEmail: (data: EmailJobData) => Promise<void> = defaultSendEmail,
) {
  const worker = new Worker<EmailJobData>(
    'email-notifications',
    async (job: Job<EmailJobData>) => {
      await sendEmail(job.data);
    },
    {
      connection,
      settings: {
        backoffStrategy: (attemptsMade: number) => {
          return RETRY_DELAYS[attemptsMade - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
        },
      },
    },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;

    // After final failure → record in failed_notifications
    if (job.attemptsMade >= 3) {
      try {
        await db.query(
          `INSERT INTO failed_notifications (user_id, trigger_type, payload, attempts, last_error)
           VALUES ($1, $2, $3, $4, $5)`,
          [job.data.userId, 'email', JSON.stringify(job.data), job.attemptsMade, err.message],
        );
      } catch (dbErr) {
        console.error('Failed to record failed_notification:', dbErr);
      }
    }
  });

  return worker;
}

// Queue factory — used by app.ts to create the queue
export { Queue } from 'bullmq';
export const EMAIL_QUEUE_NAME = 'email-notifications';

// Stub for dev — logs instead of sending
async function defaultSendEmail(data: EmailJobData): Promise<void> {
  console.log(`[email-stub] To userId=${data.userId}: ${data.title}`);
}
