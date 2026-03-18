import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { authenticator } from 'otplib';
import type { Express } from 'express';
import { buildTestApp, USERS, TEST_PASSWORD, authHeader } from './helpers.js';
import { signRefreshToken } from '../utils/jwt.js';

let app: Express;
let pool: ReturnType<typeof buildTestApp>['pool'];
let redis: ReturnType<typeof buildTestApp>['redis'];

beforeEach(() => {
  const ctx = buildTestApp();
  app = ctx.app;
  pool = ctx.pool;
  redis = ctx.redis;
});

// ─── POST /v1/auth/login ──────────────────────────────

describe('POST /v1/auth/login', () => {
  it('returns 200 with accessToken and user on valid credentials', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [USERS.admin], rowCount: 1 }) // SELECT user
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT auth_events

    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'admin@test.ru', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.id).toBe(USERS.admin.id);
    expect(res.body.data.user.email).toBe('admin@test.ru');
    expect(res.body.data.user.role).toBe('admin');
    // No sensitive fields
    expect(res.body.data.user.password_hash).toBeUndefined();
    expect(res.body.data.user.two_fa_secret).toBeUndefined();
  });

  it('sets httpOnly refresh cookie without restrictive path', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [USERS.admin], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'admin@test.ru', password: TEST_PASSWORD });

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.startsWith('refresh_token='))
      : cookies;
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
    // Must NOT have Path=/v1/auth — that breaks proxy setups (nginx /api/v1/*)
    expect(refreshCookie).not.toContain('Path=/v1/auth');
    // Default path is / — cookie sent on all requests to this domain
    expect(refreshCookie).toContain('Path=/');
  });

  it('returns 401 on wrong password', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [USERS.admin], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // auth_events

    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'admin@test.ru', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 on non-existent email', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'nobody@test.ru', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 VALIDATION_ERROR when email is missing', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ password: TEST_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );
  });

  it('returns 400 VALIDATION_ERROR when password is empty', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'admin@test.ru', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 for deactivated account (edge case)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [USERS.inactive], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // auth_events

    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'inactive@test.ru', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('деактивирован');
  });

  it('locks account after 5 failed attempts (brute-force protection)', async () => {
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 }); // no user found each time

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/v1/auth/login')
        .send({ email: 'target@test.ru', password: 'wrong' });
    }

    // 6th attempt should be blocked even before DB query
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'target@test.ru', password: 'wrong' });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('заблокирован');
  });

  it('returns 401 when 2FA required but totp_code not provided', async () => {
    const user2fa = { ...USERS.lawyer, two_fa_enabled: true, two_fa_secret: authenticator.generateSecret() };
    pool.query
      .mockResolvedValueOnce({ rows: [user2fa], rowCount: 1 });

    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: user2fa.email, password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('двухфакторной');
  });

  it('returns 200 with valid 2FA code', async () => {
    const secret = authenticator.generateSecret();
    const user2fa = { ...USERS.lawyer, two_fa_enabled: true, two_fa_secret: secret };
    pool.query
      .mockResolvedValueOnce({ rows: [user2fa], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // auth_events

    const code = authenticator.generate(secret);
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: user2fa.email, password: TEST_PASSWORD, totp_code: code });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('returns 401 with wrong 2FA code', async () => {
    const secret = authenticator.generateSecret();
    const user2fa = { ...USERS.lawyer, two_fa_enabled: true, two_fa_secret: secret };
    pool.query
      .mockResolvedValueOnce({ rows: [user2fa], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // auth_events

    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: user2fa.email, password: TEST_PASSWORD, totp_code: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('2FA');
  });
});

// ─── POST /v1/auth/refresh ────────────────────────────

describe('POST /v1/auth/refresh', () => {
  it('returns new accessToken with valid refresh cookie', async () => {
    const refresh = signRefreshToken(USERS.admin.id);
    redis._store.set(`refresh:${USERS.admin.id}:${refresh.jti}`, '1');

    pool.query.mockResolvedValueOnce({
      rows: [{ id: USERS.admin.id, email: USERS.admin.email, role: USERS.admin.role }],
      rowCount: 1,
    });

    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refresh.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('returns 401 without refresh cookie', async () => {
    const res = await request(app).post('/v1/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when refresh token revoked from Redis', async () => {
    const refresh = signRefreshToken(USERS.admin.id);
    // NOT stored in redis._store → revoked

    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refresh.token}`);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('отозван');
  });

  it('returns 401 with invalid refresh token string', async () => {
    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', 'refresh_token=invalid.jwt.token');

    expect(res.status).toBe(401);
  });

  it('works when cookie was set without restrictive path (proxy-safe)', async () => {
    // Simulate: login sets cookie, then refresh reads it.
    // Cookie with default path=/ is sent on ANY request path.
    pool.query
      .mockResolvedValueOnce({ rows: [USERS.admin], rowCount: 1 }) // login SELECT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });           // login auth_events

    const loginRes = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'admin@test.ru', password: TEST_PASSWORD });

    // Extract the cookie from login response
    const setCookie = loginRes.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie)
      ? setCookie.find((c: string) => c.startsWith('refresh_token='))!
      : setCookie;
    // Parse just the cookie value (before first ;)
    const cookieValue = cookieHeader.split(';')[0];

    // Now use that cookie to refresh
    pool.query.mockResolvedValueOnce({
      rows: [{ id: USERS.admin.id, email: USERS.admin.email, role: USERS.admin.role }],
      rowCount: 1,
    });

    const refreshRes = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', cookieValue);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
  });
});

// ─── POST /v1/auth/logout ─────────────────────────────

describe('POST /v1/auth/logout', () => {
  it('returns 200 and clears cookie when authenticated', async () => {
    const refresh = signRefreshToken(USERS.admin.id);
    redis._store.set(`refresh:${USERS.admin.id}:${refresh.jti}`, '1');

    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // auth_events

    const res = await request(app)
      .post('/v1/auth/logout')
      .set('Authorization', authHeader(USERS.admin))
      .set('Cookie', `refresh_token=${refresh.token}`);

    expect(res.status).toBe(200);
    // Refresh token removed from Redis
    expect(redis._store.has(`refresh:${USERS.admin.id}:${refresh.jti}`)).toBe(false);
    // Cookie is cleared (set to empty with past expiry)
    const setCookie = res.headers['set-cookie'];
    const clearCookie = Array.isArray(setCookie)
      ? setCookie.find((c: string) => c.startsWith('refresh_token='))
      : setCookie;
    expect(clearCookie).toBeDefined();
    // clearCookie must NOT have Path=/v1/auth (must match setCookie path)
    expect(clearCookie).not.toContain('Path=/v1/auth');
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/v1/auth/logout');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

// ─── Full cycle: login → refresh → logout ─────────────

describe('Full auth cycle: login → refresh → logout', () => {
  it('access token renews without re-login, then logout invalidates', async () => {
    // ── Step 1: Login ──────────────────────────────────
    pool.query
      .mockResolvedValueOnce({ rows: [USERS.admin], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const loginRes = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'admin@test.ru', password: TEST_PASSWORD });

    expect(loginRes.status).toBe(200);
    const firstAccessToken = loginRes.body.data.accessToken;
    expect(firstAccessToken).toBeDefined();

    // Extract refresh cookie
    const cookies = loginRes.headers['set-cookie'];
    const cookieStr = (Array.isArray(cookies)
      ? cookies.find((c: string) => c.startsWith('refresh_token='))!
      : cookies
    ).split(';')[0];
    expect(cookieStr).toContain('refresh_token=');

    // ── Step 2: Refresh — get NEW access token ─────────
    pool.query.mockResolvedValueOnce({
      rows: [{ id: USERS.admin.id, email: USERS.admin.email, role: USERS.admin.role }],
      rowCount: 1,
    });

    const refreshRes = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', cookieStr);

    expect(refreshRes.status).toBe(200);
    const secondAccessToken = refreshRes.body.data.accessToken;
    expect(secondAccessToken).toBeDefined();
    // Both are valid JWTs (3 dot-separated segments)
    expect(secondAccessToken.split('.').length).toBe(3);

    // ── Step 3: Use new access token — should work ─────
    pool.query.mockResolvedValueOnce({ rows: [USERS.admin], rowCount: 1 });

    const meRes = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${secondAccessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.id).toBe(USERS.admin.id);

    // ── Step 4: Logout — clears refresh token ──────────
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const logoutRes = await request(app)
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .set('Cookie', cookieStr);

    expect(logoutRes.status).toBe(200);

    // ── Step 5: Refresh after logout — must fail ───────
    const postLogoutRefresh = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', cookieStr);

    expect(postLogoutRefresh.status).toBe(401);
    expect(postLogoutRefresh.body.error.message).toContain('отозван');
  });
});

// ─── POST /v1/auth/change-password ────────────────────

describe('POST /v1/auth/change-password', () => {
  it('returns 200 on successful password change', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ password_hash: USERS.lawyer.password_hash }], rowCount: 1 }) // SELECT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE password
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT auth_events

    const res = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ oldPassword: TEST_PASSWORD, newPassword: 'NewSecure1' });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('Пароль изменён');
  });

  it('invalidates all refresh tokens after password change', async () => {
    // Pre-populate some refresh tokens
    redis._store.set(`refresh:${USERS.lawyer.id}:token1`, '1');
    redis._store.set(`refresh:${USERS.lawyer.id}:token2`, '1');

    pool.query
      .mockResolvedValueOnce({ rows: [{ password_hash: USERS.lawyer.password_hash }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ oldPassword: TEST_PASSWORD, newPassword: 'NewSecure1' });

    // redis.keys was called to find refresh tokens, then del to remove them
    expect(redis.keys).toHaveBeenCalledWith(`refresh:${USERS.lawyer.id}:*`);
    expect(redis.del).toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/v1/auth/change-password')
      .send({ oldPassword: TEST_PASSWORD, newPassword: 'NewSecure1' });

    expect(res.status).toBe(401);
  });

  it('returns 401 on wrong old password', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ password_hash: USERS.lawyer.password_hash }],
      rowCount: 1,
    });

    const res = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ oldPassword: 'WrongOld1', newPassword: 'NewSecure1' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('Неверный текущий пароль');
  });

  it('returns 400 when new password too short', async () => {
    const res = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ oldPassword: TEST_PASSWORD, newPassword: 'Ab1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'newPassword', message: expect.stringContaining('8') }),
      ]),
    );
  });

  it('returns 400 when new password has no digit', async () => {
    const res = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ oldPassword: TEST_PASSWORD, newPassword: 'NoDigitsHere' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when new password has no letters', async () => {
    const res = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', authHeader(USERS.lawyer))
      .send({ oldPassword: TEST_PASSWORD, newPassword: '12345678' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ─── POST /v1/auth/2fa/setup ──────────────────────────

describe('POST /v1/auth/2fa/setup', () => {
  it('returns qrCodeUrl and secret', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

    const res = await request(app)
      .post('/v1/auth/2fa/setup')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data.qrCodeUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.data.secret).toBeDefined();
    expect(typeof res.body.data.secret).toBe('string');
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/v1/auth/2fa/setup');
    expect(res.status).toBe(401);
  });
});

// ─── POST /v1/auth/2fa/verify ─────────────────────────

describe('POST /v1/auth/2fa/verify', () => {
  it('activates 2FA with valid code', async () => {
    const secret = authenticator.generateSecret();
    pool.query
      .mockResolvedValueOnce({ rows: [{ two_fa_secret: secret }], rowCount: 1 }) // SELECT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // auth_events

    const code = authenticator.generate(secret);
    const res = await request(app)
      .post('/v1/auth/2fa/verify')
      .set('Authorization', authHeader(USERS.admin))
      .send({ code });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('активирована');
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/v1/auth/2fa/verify')
      .send({ code: '123456' });
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid TOTP code', async () => {
    const secret = authenticator.generateSecret();
    pool.query.mockResolvedValueOnce({ rows: [{ two_fa_secret: secret }], rowCount: 1 });

    const res = await request(app)
      .post('/v1/auth/2fa/verify')
      .set('Authorization', authHeader(USERS.admin))
      .send({ code: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Неверный код');
  });

  it('returns 400 when 2fa/setup was not called first', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ two_fa_secret: null }], rowCount: 1 });

    const res = await request(app)
      .post('/v1/auth/2fa/verify')
      .set('Authorization', authHeader(USERS.admin))
      .send({ code: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('setup');
  });
});

// ─── GET /v1/auth/me ──────────────────────────────────

describe('GET /v1/auth/me', () => {
  it('returns current user profile', async () => {
    pool.query.mockResolvedValueOnce({ rows: [USERS.admin], rowCount: 1 });

    const res = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(USERS.admin.id);
    expect(res.body.data.email).toBe(USERS.admin.email);
    expect(res.body.data.role).toBe('admin');
    expect(res.body.data.firstName).toBe('Алексей');
    expect(res.body.data.lastName).toBe('Иванов');
  });

  it('does not expose password_hash or two_fa_secret', async () => {
    pool.query.mockResolvedValueOnce({ rows: [USERS.admin], rowCount: 1 });

    const res = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', authHeader(USERS.admin));

    expect(res.body.data.password_hash).toBeUndefined();
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.two_fa_secret).toBeUndefined();
    expect(res.body.data.twoFaSecret).toBeUndefined();
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with expired/invalid token', async () => {
    const res = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(res.status).toBe(401);
  });
});
