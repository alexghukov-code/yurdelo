/**
 * Bug 1: Refresh interceptor was triggered on 401 from /auth/login
 * Fix: skip refresh for /auth/* routes
 *
 * Bug 2: Refresh works for non-auth endpoints, queues concurrent requests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import api, { extractError, isStaleDataError } from '../api/client';
import { AxiosError } from 'axios';

beforeEach(() => {
  localStorage.clear();
});

describe('JWT refresh interceptor', () => {
  it('does NOT attempt refresh when /auth/login returns 401 (bug #1)', async () => {
    let refreshCalled = false;
    server.use(
      http.post('/api/v1/auth/login', () => {
        return HttpResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Неверный email или пароль.' } },
          { status: 401 },
        );
      }),
      http.post('/api/v1/auth/refresh', () => {
        refreshCalled = true;
        return HttpResponse.json({ data: { accessToken: 'new-token' } });
      }),
    );

    await expect(
      api.post('/auth/login', { email: 'bad@test.ru', password: 'wrong' }),
    ).rejects.toThrow();

    expect(refreshCalled).toBe(false);
  });

  it('attempts refresh on 401 from non-auth endpoint and retries', async () => {
    localStorage.setItem('accessToken', 'expired-token');
    let refreshCalled = false;

    server.use(
      http.get('/api/v1/cases', ({ request }) => {
        if (request.headers.get('Authorization') === 'Bearer fresh-token') {
          return HttpResponse.json({ data: [], meta: { total: 0 } });
        }
        return HttpResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'expired' } },
          { status: 401 },
        );
      }),
      http.post('/api/v1/auth/refresh', () => {
        refreshCalled = true;
        return HttpResponse.json({ data: { accessToken: 'fresh-token' } });
      }),
    );

    const response = await api.get('/cases');

    expect(refreshCalled).toBe(true);
    expect(response.status).toBe(200);
    expect(localStorage.getItem('accessToken')).toBe('fresh-token');
  });

  it('clears token and rejects when refresh itself fails', async () => {
    localStorage.setItem('accessToken', 'expired-token');

    server.use(
      http.get('/api/v1/cases', () => {
        return HttpResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
      }),
      http.post('/api/v1/auth/refresh', () => {
        return HttpResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
      }),
    );

    await expect(api.get('/cases')).rejects.toThrow();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('queues concurrent 401s into single refresh (no duplicate refreshes)', async () => {
    localStorage.setItem('accessToken', 'expired');
    let refreshCount = 0;

    server.use(
      http.get('/api/v1/cases', ({ request }) => {
        if (request.headers.get('Authorization') === 'Bearer refreshed') {
          return HttpResponse.json({ data: [], meta: { total: 0 } });
        }
        return HttpResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
      }),
      http.get('/api/v1/notifications', ({ request }) => {
        if (request.headers.get('Authorization') === 'Bearer refreshed') {
          return HttpResponse.json({ data: [], meta: { unreadCount: 0 } });
        }
        return HttpResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
      }),
      http.post('/api/v1/auth/refresh', async () => {
        refreshCount++;
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ data: { accessToken: 'refreshed' } });
      }),
    );

    const [r1, r2] = await Promise.all([api.get('/cases'), api.get('/notifications')]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(refreshCount).toBe(1);
  });
});

describe('extractError', () => {
  it('extracts structured API error', () => {
    const err = new AxiosError('test', '400', undefined, undefined, {
      status: 400,
      data: { error: { code: 'VALIDATION_ERROR', message: 'Ошибка.', details: [] } },
    } as any);
    expect(extractError(err)).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Ошибка.',
      details: [],
    });
  });

  it('returns generic error for non-axios errors', () => {
    expect(extractError(new Error('boom')).code).toBe('UNKNOWN');
  });
});

describe('isStaleDataError', () => {
  it('true for 409', () => {
    const err = new AxiosError('x', '409', undefined, undefined, { status: 409 } as any);
    expect(isStaleDataError(err)).toBe(true);
  });
  it('false for 400', () => {
    const err = new AxiosError('x', '400', undefined, undefined, { status: 400 } as any);
    expect(isStaleDataError(err)).toBe(false);
  });
});
