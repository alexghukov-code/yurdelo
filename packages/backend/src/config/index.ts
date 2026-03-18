import 'dotenv/config';

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  databaseUrl: requireEnv(
    'DATABASE_URL',
    'postgres://app_user:app_password@localhost:5432/yurdelo',
  ),

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: requireEnv('JWT_SECRET', 'dev-secret-change-me'),
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'https://s3.storage.selcloud.ru',
    region: process.env.S3_REGION || 'ru-1',
    bucket: process.env.S3_BUCKET || 'yurdelo-docs',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
  },
} as const;
