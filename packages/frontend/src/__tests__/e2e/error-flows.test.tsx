import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../renderWith';
import { Routes, Route } from 'react-router-dom';
import { USERS, EMPTY_NOTIFICATIONS, EMPTY_REPORT, EMPTY_LIST } from '../mocks/fixtures';
import { AppShell } from '../../components/AppShell';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { LoginPage } from '../../pages/LoginPage';
import { CasesPage } from '../../pages/CasesPage';
import { CaseDetailPage } from '../../pages/CaseDetailPage';
import { DashboardPage } from '../../pages/DashboardPage';

function loginAsLawyer() {
  localStorage.setItem('accessToken', 'token');
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ data: USERS.lawyer })),
    http.get('/api/v1/notifications', () => HttpResponse.json(EMPTY_NOTIFICATIONS)),
    http.get('/api/v1/reports/my', () => HttpResponse.json(EMPTY_REPORT)),
  );
}

// ═══════════════════════════════════════════════════════
// 401 → redirect to login
// ═══════════════════════════════════════════════════════

describe('401 flows', () => {
  beforeEach(() => localStorage.clear());

  it('unauthenticated user on protected route → redirected to login', async () => {
    // Default handlers return 401 for /auth/me
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/cases" element={<CasesPage />} />
          </Route>
        </Route>
      </Routes>,
      { route: '/cases' },
    );

    await waitFor(() => {
      expect(screen.getByText('Войти')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════
// 403 → forbidden
// ═══════════════════════════════════════════════════════

describe('403 flows', () => {
  beforeEach(() => {
    localStorage.clear();
    loginAsLawyer();
  });

  it('case detail returns 403 → shows Нет доступа', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () =>
        HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'Нет прав.' } }, { status: 403 }),
      ),
    );

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="cases/:id" element={<CaseDetailPage />} />
          </Route>
        </Route>
      </Routes>,
      { route: '/cases/c-forbidden' },
    );

    await waitFor(() => {
      expect(screen.getByText('Нет доступа')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════
// 404 → not found
// ═══════════════════════════════════════════════════════

describe('404 flows', () => {
  beforeEach(() => {
    localStorage.clear();
    loginAsLawyer();
  });

  it('case detail returns 404 → shows not found message', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Не найдено.' } },
          { status: 404 },
        ),
      ),
    );

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="cases/:id" element={<CaseDetailPage />} />
          </Route>
        </Route>
      </Routes>,
      { route: '/cases/c-missing' },
    );

    await waitFor(() => {
      expect(screen.getByText(/не найден/i)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════
// 500 → error with retry
// ═══════════════════════════════════════════════════════

describe('500 flows', () => {
  beforeEach(() => {
    localStorage.clear();
    loginAsLawyer();
  });

  it('cases list returns 500 → shows error with retry', async () => {
    server.use(
      http.get('/api/v1/cases', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Ошибка.' } },
          { status: 500 },
        ),
      ),
    );

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="cases" element={<CasesPage />} />
          </Route>
        </Route>
      </Routes>,
      { route: '/cases' },
    );

    await waitFor(() => {
      expect(screen.getByText(/Не удалось загрузить/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Повторить')).toBeInTheDocument();
  });

  it('dashboard returns 500 → shows error with retry', async () => {
    server.use(
      http.get('/api/v1/cases', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Ошибка.' } },
          { status: 500 },
        ),
      ),
    );

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
          </Route>
        </Route>
      </Routes>,
      { route: '/' },
    );

    await waitFor(() => {
      expect(screen.getByText(/Не удалось загрузить/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Повторить')).toBeInTheDocument();
  });
});
