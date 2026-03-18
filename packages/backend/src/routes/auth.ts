import { Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { signAccessToken, signRefreshToken, verifyToken, type RefreshPayload } from '../utils/jwt.js';
import { validate, loginSchema, changePasswordSchema, verify2faSchema } from '../utils/validation.js';
import '../types.js';

const REFRESH_TTL = 7 * 24 * 3600; // 7 days in seconds
const LOCK_TTL = 15 * 60;          // 15 min
const MAX_ATTEMPTS = 5;

export function authRouter(deps: { db: Pool; redis: Redis }) {
  const { db, redis } = deps;
  const router = Router();

  // ── POST /auth/login ────────────────────────────────
  router.post('/auth/login', async (req, res) => {
    const { email, password, totp_code } = validate(loginSchema, req.body);

    // Brute-force check
    const lockKey = `login:lock:${email}`;
    const locked = await redis.get(lockKey);
    if (locked) {
      throw AppError.forbidden('Аккаунт временно заблокирован. Попробуйте через 15 минут.');
    }

    // Find user
    const { rows } = await db.query(
      `SELECT id, email, password_hash, role, status, first_name, last_name, middle_name,
              two_fa_enabled, two_fa_secret
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );
    const user = rows[0];

    if (!user) {
      await recordFailedAttempt(email);
      throw AppError.unauthorized('Неверный email или пароль.');
    }

    if (user.status === 'inactive') {
      await logAuthEvent(user.id, 'login_blocked', req);
      throw AppError.forbidden('Аккаунт деактивирован. Обратитесь к руководителю.');
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      await recordFailedAttempt(email);
      await logAuthEvent(user.id, 'login_failed', req);
      throw AppError.unauthorized('Неверный email или пароль.');
    }

    // 2FA check
    if (user.two_fa_enabled) {
      if (!totp_code) {
        throw AppError.unauthorized('Требуется код двухфакторной аутентификации.');
      }
      const valid2fa = authenticator.verify({ token: totp_code, secret: user.two_fa_secret });
      if (!valid2fa) {
        await logAuthEvent(user.id, '2fa_failed', req);
        throw AppError.unauthorized('Неверный код 2FA.');
      }
    }

    // Clear failed attempts
    await redis.del(`login:attempts:${email}`);

    // Issue tokens
    const accessToken = signAccessToken({ sub: user.id, role: user.role, email: user.email });
    const refresh = signRefreshToken(user.id);
    await redis.set(`refresh:${user.id}:${refresh.jti}`, '1', 'EX', REFRESH_TTL);

    res.cookie('refresh_token', refresh.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_TTL * 1000,
    });

    await logAuthEvent(user.id, 'login_success', req);

    res.json({
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.first_name,
          lastName: user.last_name,
          middleName: user.middle_name,
          twoFaEnabled: user.two_fa_enabled,
        },
      },
    });
  });

  // ── POST /auth/refresh ──────────────────────────────
  router.post('/auth/refresh', async (req, res) => {
    const token = req.cookies?.refresh_token;
    if (!token) {
      throw AppError.unauthorized('Refresh token отсутствует.');
    }

    let payload: RefreshPayload;
    try {
      payload = verifyToken<RefreshPayload>(token);
    } catch {
      throw AppError.unauthorized('Refresh token недействителен или истёк.');
    }

    const exists = await redis.get(`refresh:${payload.sub}:${payload.jti}`);
    if (!exists) {
      throw AppError.unauthorized('Refresh token отозван.');
    }

    const { rows } = await db.query(
      `SELECT id, email, role FROM users WHERE id = $1 AND deleted_at IS NULL AND status = 'active'`,
      [payload.sub],
    );
    if (!rows[0]) {
      throw AppError.unauthorized('Пользователь не найден или деактивирован.');
    }

    const user = rows[0];
    const accessToken = signAccessToken({ sub: user.id, role: user.role, email: user.email });

    res.json({ data: { accessToken } });
  });

  // ── POST /auth/logout ───────────────────────────────
  router.post('/auth/logout', requireAuth, async (req, res) => {
    const token = req.cookies?.refresh_token;
    if (token) {
      try {
        const payload = verifyToken<RefreshPayload>(token);
        await redis.del(`refresh:${payload.sub}:${payload.jti}`);
      } catch {
        // token invalid — nothing to revoke
      }
    }

    res.clearCookie('refresh_token');
    await logAuthEvent(req.user!.id, 'logout', req);
    res.json({ data: { message: 'Сессия завершена.' } });
  });

  // ── POST /auth/change-password ──────────────────────
  router.post('/auth/change-password', requireAuth, async (req, res) => {
    const { oldPassword, newPassword } = validate(changePasswordSchema, req.body);

    const { rows } = await db.query(
      `SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user!.id],
    );
    if (!rows[0]) throw AppError.notFound();

    const valid = await comparePassword(oldPassword, rows[0].password_hash);
    if (!valid) {
      throw AppError.unauthorized('Неверный текущий пароль.');
    }

    const hash = await hashPassword(newPassword);
    await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, req.user!.id]);

    // Invalidate all refresh tokens
    const keys = await redis.keys(`refresh:${req.user!.id}:*`);
    if (keys.length > 0) await redis.del(...keys);

    res.clearCookie('refresh_token');
    await logAuthEvent(req.user!.id, 'password_changed', req);

    res.json({ data: { message: 'Пароль изменён. Все сессии завершены.' } });
  });

  // ── POST /auth/2fa/setup ────────────────────────────
  router.post('/auth/2fa/setup', requireAuth, async (req, res) => {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(req.user!.email, 'ЮрДело', secret);
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    // Store secret (not yet enabled — verify step activates it)
    await db.query(`UPDATE users SET two_fa_secret = $1 WHERE id = $2`, [secret, req.user!.id]);

    res.json({ data: { qrCodeUrl, secret } });
  });

  // ── POST /auth/2fa/verify ──────────────────────────
  router.post('/auth/2fa/verify', requireAuth, async (req, res) => {
    const { code } = validate(verify2faSchema, req.body);

    const { rows } = await db.query(
      `SELECT two_fa_secret FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user!.id],
    );
    if (!rows[0]?.two_fa_secret) {
      throw AppError.badRequest('Сначала выполните /auth/2fa/setup.');
    }

    const valid = authenticator.verify({ token: code, secret: rows[0].two_fa_secret });
    if (!valid) {
      throw AppError.badRequest('Неверный код. Попробуйте снова.');
    }

    await db.query(`UPDATE users SET two_fa_enabled = true WHERE id = $1`, [req.user!.id]);
    await logAuthEvent(req.user!.id, '2fa_enabled', req);

    res.json({ data: { message: 'Двухфакторная аутентификация активирована.' } });
  });

  // ── GET /auth/me ────────────────────────────────────
  router.get('/auth/me', requireAuth, async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, email, role, status, first_name, last_name, middle_name,
              phone, two_fa_enabled, created_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user!.id],
    );
    if (!rows[0]) throw AppError.notFound();

    const u = rows[0];
    res.json({
      data: {
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        firstName: u.first_name,
        lastName: u.last_name,
        middleName: u.middle_name,
        phone: u.phone,
        twoFaEnabled: u.two_fa_enabled,
        createdAt: u.created_at,
      },
    });
  });

  // ── Helpers ─────────────────────────────────────────
  async function recordFailedAttempt(email: string) {
    const attemptsKey = `login:attempts:${email}`;
    const attempts = await redis.incr(attemptsKey);
    await redis.expire(attemptsKey, 60); // window: 1 min
    if (attempts >= MAX_ATTEMPTS) {
      await redis.set(lockKey(email), '1', 'EX', LOCK_TTL);
      await redis.del(attemptsKey);
    }
  }

  function lockKey(email: string) {
    return `login:lock:${email}`;
  }

  async function logAuthEvent(
    userId: string,
    event: string,
    req: { ip?: string; headers: Record<string, unknown> },
  ) {
    await db.query(
      `INSERT INTO auth_events (user_id, event, ip_address, user_agent) VALUES ($1, $2, $3, $4)`,
      [userId, event, req.ip ?? null, req.headers['user-agent'] ?? null],
    );
  }

  return router;
}
