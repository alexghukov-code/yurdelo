import express from 'express';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { config } from './config/index.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { partiesRouter } from './routes/parties.js';
import { casesRouter } from './routes/cases.js';
import { stagesRouter } from './routes/stages.js';
import { hearingsRouter } from './routes/hearings.js';
import { transfersRouter } from './routes/transfers.js';
import { documentsRouter } from './routes/documents.js';
import { createS3Service, type S3Service } from './services/s3Service.js';
import { notificationsRouter } from './routes/notifications.js';
import { reportsRouter } from './routes/reports.js';
import { EMAIL_QUEUE_NAME } from './services/emailWorker.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { createRlsMiddleware } from './middleware/rls.js';
import { createApiLogger } from './middleware/apiLogger.js';

export function createApp(deps?: {
  db?: Pool;
  redis?: Redis;
  emailQueue?: Queue | null;
  s3?: S3Service;
  disableRateLimit?: boolean;
  disableApiLogger?: boolean;
}) {
  const app = express();

  const db = deps?.db ?? new Pool({ connectionString: config.databaseUrl });

  const redis =
    deps?.redis ??
    new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      lazyConnect: true,
    });

  const emailQueue =
    deps?.emailQueue !== undefined
      ? deps.emailQueue
      : new Queue(EMAIL_QUEUE_NAME, { connection: redis as any });

  // Trust first proxy (nginx) — req.ip uses X-Forwarded-For
  app.set('trust proxy', 1);

  app.use(express.json());
  app.use(cookieParser());

  // C2: Rate limiting — Redis sliding window (TZ §1.3.3)
  if (!deps?.disableRateLimit) {
    app.use('/v1', createRateLimiter(redis));
  }

  // C4: API request logging → api_logs (TZ §1.3.5)
  if (!deps?.disableApiLogger) {
    app.use('/v1', createApiLogger(db));
  }

  // Public
  app.use(healthRouter({ db, redis }));

  // API v1 — auth first
  app.use('/v1', authRouter({ db, redis }));

  // C3: RLS context — sets app.current_user_id/role per request (TZ §3.2)
  app.use('/v1', createRlsMiddleware(db));

  app.use('/v1', usersRouter({ db, redis }));
  app.use('/v1', partiesRouter({ db, redis }));
  app.use('/v1', casesRouter({ db, redis }));
  app.use('/v1', stagesRouter({ db, redis }));
  app.use('/v1', hearingsRouter({ db, redis }));
  app.use('/v1', transfersRouter({ db, redis, emailQueue }));
  const s3 = deps?.s3 ?? (config.s3.accessKey ? createS3Service() : undefined);
  app.use('/v1', documentsRouter({ db, redis, s3 }));
  app.use('/v1', notificationsRouter({ db, redis }));
  app.use('/v1', reportsRouter({ db, redis }));

  // Error handler (must be last)
  app.use(errorHandler);

  return { app, db, redis, emailQueue };
}
