import { createApp } from './app.js';
import { config } from './config/index.js';
import pino from 'pino';

const logger = pino({
  transport: config.nodeEnv === 'development' ? { target: 'pino-pretty' } : undefined,
});

const { app, db, redis } = createApp();

async function start() {
  try {
    await redis.connect();
    logger.info('Redis connected');

    await db.query('SELECT 1');
    logger.info('PostgreSQL connected');

    app.listen(config.port, () => {
      logger.info(`Server running on http://localhost:${config.port}`);
    });
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

start();

const shutdown = async () => {
  logger.info('Shutting down...');
  await db.end();
  redis.disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
