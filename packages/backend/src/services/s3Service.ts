import {
  S3Client,
  PutObjectCommand,
  DeleteObjectTaggingCommand,
  PutObjectTaggingCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'node:crypto';
import { config } from '../config/index.js';

// ── Retry config per TZ §5.2 ─────────────────────────
const RETRY_DELAYS = [500, 1000, 2000]; // ms
const MAX_ATTEMPTS = 3;

// ── S3 Client (Selectel-compatible) ───────────────────

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
      },
      forcePathStyle: true, // Selectel requires path-style
    });
  }
  return _client;
}

export interface S3Service {
  upload(
    file: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<{ s3Key: string; size: number }>;
  getSignedDownloadUrl(s3Key: string): Promise<{ url: string; expiresAt: string }>;
  tagAsDeleted(s3Key: string): Promise<void>;
}

export function createS3Service(client?: S3Client): S3Service {
  const s3 = client ?? getClient();
  const bucket = config.s3.bucket;

  return {
    /**
     * Upload file to S3 with retry (3 attempts: 500ms → 1s → 2s).
     * Generates a unique key: documents/{YYYY}/{uuid}/{originalName}
     */
    async upload(file: Buffer, originalName: string, mimeType: string) {
      const year = new Date().getFullYear();
      const id = crypto.randomUUID();
      const s3Key = `documents/${year}/${id}/${originalName}`;

      const params: PutObjectCommandInput = {
        Bucket: bucket,
        Key: s3Key,
        Body: file,
        ContentType: mimeType,
      };

      await withRetry(() => s3.send(new PutObjectCommand(params)), 'S3 upload');

      return { s3Key, size: file.length };
    },

    /**
     * Generate a pre-signed GET URL valid for 1 hour.
     * No retry — local operation (no network call to S3).
     */
    async getSignedDownloadUrl(s3Key: string) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
      const expiresAt = new Date(Date.now() + 3600_000).toISOString();
      return { url, expiresAt };
    },

    /**
     * Tag object as deleted (S3 Lifecycle Rule deletes after 30 days).
     * 3 retry attempts per TZ §5.2.
     */
    async tagAsDeleted(s3Key: string) {
      await withRetry(
        () =>
          s3.send(
            new PutObjectTaggingCommand({
              Bucket: bucket,
              Key: s3Key,
              Tagging: { TagSet: [{ Key: 'deleted', Value: 'true' }] },
            }),
          ),
        'S3 tag-delete',
      );
    },
  };
}

// ── Retry helper ──────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = MAX_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await sleep(RETRY_DELAYS[i] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]);
      }
    }
  }
  throw lastError;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Override client for testing */
export function _setClient(c: S3Client | null) {
  _client = c;
}
