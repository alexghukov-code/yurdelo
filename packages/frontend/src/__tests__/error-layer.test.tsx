import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { renderWithProviders } from './renderWith';
import { Routes, Route } from 'react-router-dom';
import { getHttpStatus, getRetryAfter } from '../api/client';
import { QueryErrorView } from '../components/QueryErrorView';

// ═══════════════════════════════════════════════════════
// getHttpStatus
// ═══════════════════════════════════════════════════════

describe('getHttpStatus', () => {
  it('returns status from AxiosError', () => {
    const err = new AxiosError('x', '403', undefined, undefined, { status: 403 } as any);
    expect(getHttpStatus(err)).toBe(403);
  });

  it('returns undefined for non-axios error', () => {
    expect(getHttpStatus(new Error('boom'))).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════
// getRetryAfter
// ═══════════════════════════════════════════════════════

describe('getRetryAfter', () => {
  it('returns seconds from Retry-After header on 429', () => {
    const err = new AxiosError('x', '429', undefined, undefined, {
      status: 429,
      headers: { 'retry-after': '60' },
    } as any);
    expect(getRetryAfter(err)).toBe(60);
  });

  it('returns undefined for non-429', () => {
    const err = new AxiosError('x', '400', undefined, undefined, {
      status: 400,
      headers: { 'retry-after': '60' },
    } as any);
    expect(getRetryAfter(err)).toBeUndefined();
  });

  it('returns undefined when no Retry-After header', () => {
    const err = new AxiosError('x', '429', undefined, undefined, {
      status: 429,
      headers: {},
    } as any);
    expect(getRetryAfter(err)).toBeUndefined();
  });

  it('returns undefined for non-numeric header', () => {
    const err = new AxiosError('x', '429', undefined, undefined, {
      status: 429,
      headers: { 'retry-after': 'Wed, 21 Oct 2025 07:28:00 GMT' },
    } as any);
    expect(getRetryAfter(err)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════
// QueryErrorView
// ═══════════════════════════════════════════════════════

describe('QueryErrorView', () => {
  beforeEach(() => {
    localStorage.setItem('accessToken', 'valid-token');
    server.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({
          data: { id: 'u1', email: 'a@t.ru', role: 'lawyer', firstName: 'T', lastName: 'T', twoFaEnabled: false },
        }),
      ),
    );
  });

  it('renders AccessDenied for 403', async () => {
    const err = new AxiosError('x', '403', undefined, undefined, { status: 403 } as any);

    renderWithProviders(
      <Routes>
        <Route path="/" element={<QueryErrorView error={err} onRetry={() => {}} />} />
      </Routes>,
    );

    await waitFor(() => {
      expect(screen.getByText('Нет доступа')).toBeInTheDocument();
    });
    expect(screen.queryByText('Повторить')).not.toBeInTheDocument();
  });

  it('renders not-found message without retry for 404', async () => {
    const err = new AxiosError('x', '404', undefined, undefined, { status: 404 } as any);

    renderWithProviders(
      <Routes>
        <Route path="/" element={<QueryErrorView error={err} onRetry={() => {}} />} />
      </Routes>,
    );

    await waitFor(() => {
      expect(screen.getByText(/не найден/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Повторить')).not.toBeInTheDocument();
  });

  it('renders generic error with retry for 500', async () => {
    const err = new AxiosError('x', '500', undefined, undefined, { status: 500 } as any);

    renderWithProviders(
      <Routes>
        <Route path="/" element={<QueryErrorView error={err} onRetry={() => {}} />} />
      </Routes>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Не удалось загрузить/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Повторить')).toBeInTheDocument();
  });
});
