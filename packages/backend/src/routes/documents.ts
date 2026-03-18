import { Router } from 'express';
import multer from 'multer';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { writeAuditLog } from '../utils/audit.js';
import type { S3Service } from '../services/s3Service.js';
import { getDb } from '../utils/db.js';
import '../types.js';

const MAX_FILE_SIZE = 52_428_800; // 50 MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'text/plain',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

export function documentsRouter(deps: { db: Pool; redis: Redis; s3?: S3Service }) {
  const { db: rawDb, s3 } = deps;
  const router = Router();

  // ── POST /hearings/:hearingId/documents ─────────────
  // multipart/form-data — field name: "file"
  // Rate limit: 10/min per user (handled at middleware layer)
  router.post(
    '/hearings/:hearingId/documents',
    requireAuth,
    requireRole('admin', 'lawyer'),
    upload.single('file'),
    async (req, res) => {
      const db = getDb(req, rawDb);
      const file = req.file;
      if (!file) throw AppError.badRequest('Файл обязателен (field: "file").');

      // Mime-type validation
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw AppError.badRequest(
          `Недопустимый тип файла: ${file.mimetype}. Разрешены: PDF, DOCX, XLSX, JPEG, PNG, TIFF, TXT.`,
        );
      }

      // Verify hearing → stage → case ownership
      const {
        rows: [ctx],
      } = await db.query(
        `SELECT h.id AS hearing_id, s.case_id, c.lawyer_id
         FROM hearings h
         JOIN stages s ON s.id = h.stage_id
         JOIN cases c ON c.id = s.case_id
         WHERE h.id = $1 AND h.deleted_at IS NULL
           AND s.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [req.params.hearingId],
      );
      if (!ctx) throw AppError.notFound('Слушание не найдено.');
      if (req.user!.role === 'lawyer' && ctx.lawyer_id !== req.user!.id) {
        throw AppError.notFound('Слушание не найдено.');
      }

      // Upload to S3 (with retry)
      let s3Key: string;
      if (s3) {
        const result = await s3.upload(file.buffer, file.originalname, file.mimetype);
        s3Key = result.s3Key;
      } else {
        // Dev fallback when S3 not configured
        s3Key = `local/${Date.now()}/${file.originalname}`;
      }

      // Insert DB record
      const { rows } = await db.query(
        `INSERT INTO documents (hearing_id, case_id, file_name, file_size, mime_type, s3_key, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          req.params.hearingId,
          ctx.case_id,
          file.originalname,
          file.size,
          file.mimetype,
          s3Key,
          req.user!.id,
        ],
      );

      await writeAuditLog(db, {
        userId: req.user!.id,
        action: 'CREATE',
        entityType: 'document',
        entityId: rows[0].id,
        newValue: { fileName: file.originalname, fileSize: file.size, mimeType: file.mimetype },
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string,
      });

      res.status(201).json({ data: formatDoc(rows[0]) });
    },
  );

  // ── GET /documents/:id/url ──────────────────────────
  // Returns signed URL valid for 1 hour.
  // Viewer: allowed if case is visible (all cases for viewer).
  router.get('/documents/:id/url', requireAuth, async (req, res) => {
    const db = getDb(req, rawDb);
    const {
      rows: [doc],
    } = await db.query(
      `SELECT d.id, d.s3_key, d.file_name, d.case_id, c.lawyer_id
       FROM documents d
       JOIN cases c ON c.id = d.case_id
       WHERE d.id = $1 AND d.deleted_at IS NULL AND c.deleted_at IS NULL`,
      [req.params.id],
    );
    if (!doc) throw AppError.notFound('Документ не найден.');

    if (req.user!.role === 'lawyer' && doc.lawyer_id !== req.user!.id) {
      throw AppError.notFound('Документ не найден.');
    }

    let url: string;
    let expiresAt: string;

    if (s3) {
      const result = await s3.getSignedDownloadUrl(doc.s3_key);
      url = result.url;
      expiresAt = result.expiresAt;
    } else {
      url = `http://localhost:3000/stub/${doc.s3_key}`;
      expiresAt = new Date(Date.now() + 3600_000).toISOString();
    }

    res.json({ data: { url, expiresAt } });
  });

  // ── DELETE /documents/:id ───────────────────────────
  // TZ §7.2:
  //   Admin  → always
  //   Lawyer → only if uploaded_by = me AND case belongs to me
  //   Viewer → never
  // Soft delete in DB + tag deleted=true in S3
  router.delete('/documents/:id', requireAuth, async (req, res) => {
    const db = getDb(req, rawDb);
    if (req.user!.role === 'viewer') {
      throw AppError.forbidden('Наблюдатель не может удалять документы.');
    }

    const {
      rows: [doc],
    } = await db.query(
      `SELECT d.id, d.s3_key, d.uploaded_by, d.file_name, d.case_id, c.lawyer_id
       FROM documents d
       JOIN cases c ON c.id = d.case_id
       WHERE d.id = $1 AND d.deleted_at IS NULL AND c.deleted_at IS NULL`,
      [req.params.id],
    );
    if (!doc) throw AppError.notFound('Документ не найден.');

    // Lawyer: must own the case AND have uploaded the file
    if (req.user!.role === 'lawyer') {
      if (doc.lawyer_id !== req.user!.id) {
        throw AppError.notFound('Документ не найден.');
      }
      if (doc.uploaded_by !== req.user!.id) {
        throw AppError.forbidden('Вы можете удалить только свои загруженные файлы.');
      }
    }

    // Soft delete in DB
    await db.query(`UPDATE documents SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);

    // Tag in S3 (fire-and-forget — failure logged, retry via cron)
    if (s3) {
      s3.tagAsDeleted(doc.s3_key).catch((err) => {
        console.error(`Failed to tag S3 object ${doc.s3_key} as deleted:`, err);
      });
    }

    await writeAuditLog(db, {
      userId: req.user!.id,
      action: 'DELETE',
      entityType: 'document',
      entityId: req.params.id as string,
      oldValue: { fileName: doc.file_name, s3Key: doc.s3_key },
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });

    res.json({ data: { message: 'Документ удалён.' } });
  });

  return router;
}

function formatDoc(d: any) {
  return {
    id: d.id,
    hearingId: d.hearing_id,
    caseId: d.case_id,
    fileName: d.file_name,
    fileSize: d.file_size,
    mimeType: d.mime_type,
    s3Key: d.s3_key,
    uploadedBy: d.uploaded_by,
    createdAt: d.created_at,
  };
}
