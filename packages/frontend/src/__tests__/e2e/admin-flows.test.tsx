import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../renderWith';
import { Routes, Route } from 'react-router-dom';
import { USERS, PARTIES, CASES, EMPTY_LIST, EMPTY_NOTIFICATIONS, EMPTY_REPORT } from '../mocks/fixtures';
import { AppShell } from '../../components/AppShell';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { CasesPage } from '../../pages/CasesPage';
import { CaseDetailPage } from '../../pages/CaseDetailPage';
import { UsersPage } from '../../pages/UsersPage';
import { ReportsPage } from '../../pages/ReportsPage';

function loginAsAdmin() {
  localStorage.setItem('accessToken', 'admin-token');
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ data: USERS.admin })),
    http.get('/api/v1/notifications', () => HttpResponse.json(EMPTY_NOTIFICATIONS)),
    http.get('/api/v1/reports/my', () => HttpResponse.json(EMPTY_REPORT)),
  );
}

function renderApp(route: string, ui: React.ReactElement) {
  return renderWithProviders(
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          {ui}
        </Route>
      </Route>
    </Routes>,
    { route },
  );
}

describe('Admin flows', () => {
  beforeEach(() => {
    localStorage.clear();
    loginAsAdmin();
  });

  it('sees all sidebar nav items including Users and Reports', async () => {
    server.use(
      http.get('/api/v1/cases', () => HttpResponse.json(EMPTY_LIST)),
    );

    renderApp('/', <Route index element={<CasesPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Контрагенты')).toBeInTheDocument();
    });
    expect(screen.getByText('Календарь')).toBeInTheDocument();
    expect(screen.getByText('Отчёты')).toBeInTheDocument();
    expect(screen.getByText('Пользователи')).toBeInTheDocument();
  });

  it('can open case create modal', async () => {
    server.use(
      http.get('/api/v1/cases', () => HttpResponse.json(EMPTY_LIST)),
      http.get('/api/v1/parties', () => HttpResponse.json({ data: PARTIES, meta: { page: 1, limit: 50, total: 2, totalPages: 1 } })),
    );

    renderApp('/cases', <Route path="cases" element={<CasesPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Дело')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Дело'));

    await waitFor(() => {
      expect(screen.getByText('Новое дело')).toBeInTheDocument();
    });
  });

  it('sees edit/delete/status/transfer buttons on case detail', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () => HttpResponse.json({ data: CASES.own })),
      http.get('/api/v1/transfers', () => HttpResponse.json(EMPTY_LIST)),
    );

    renderApp('/cases/c1', <Route path="cases/:id" element={<CaseDetailPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Своё дело')).toBeInTheDocument();
    });
    expect(screen.getByText('Редактировать')).toBeInTheDocument();
    expect(screen.getByText('Передать дело')).toBeInTheDocument();
  });

  it('sees + Пользователь button on users page', async () => {
    server.use(
      http.get('/api/v1/users', () => HttpResponse.json(EMPTY_LIST)),
    );

    renderApp('/users', <Route path="users" element={<UsersPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Пользователь')).toBeInTheDocument();
    });
  });

  it('sees all report tabs', async () => {
    server.use(
      http.get('/api/v1/reports/my', () => HttpResponse.json(EMPTY_REPORT)),
    );

    renderApp('/reports', (
      <Route path="reports" element={<ProtectedRoute roles={['admin', 'lawyer']} />}>
        <Route index element={<ReportsPage />} />
      </Route>
    ));

    await waitFor(() => {
      expect(screen.getByText('Мои показатели')).toBeInTheDocument();
    });
    expect(screen.getByText('Нагрузка')).toBeInTheDocument();
    expect(screen.getByText('Результаты')).toBeInTheDocument();
    expect(screen.getByText('Застой')).toBeInTheDocument();
    expect(screen.getByText('Финансы')).toBeInTheDocument();
  });
});
