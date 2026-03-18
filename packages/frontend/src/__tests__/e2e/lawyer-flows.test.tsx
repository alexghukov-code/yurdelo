import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../renderWith';
import { Routes, Route } from 'react-router-dom';
import { USERS, CASES, EMPTY_LIST, EMPTY_NOTIFICATIONS, EMPTY_REPORT } from '../mocks/fixtures';
import { AppShell } from '../../components/AppShell';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { CasesPage } from '../../pages/CasesPage';
import { CaseDetailPage } from '../../pages/CaseDetailPage';
import { ReportsPage } from '../../pages/ReportsPage';

function loginAsLawyer() {
  localStorage.setItem('accessToken', 'lawyer-token');
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ data: USERS.lawyer })),
    http.get('/api/v1/notifications', () => HttpResponse.json(EMPTY_NOTIFICATIONS)),
    http.get('/api/v1/reports/my', () => HttpResponse.json(EMPTY_REPORT)),
  );
}

function renderApp(route: string, ui: React.ReactElement) {
  return renderWithProviders(
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>{ui}</Route>
      </Route>
    </Routes>,
    { route },
  );
}

describe('Lawyer flows', () => {
  beforeEach(() => {
    localStorage.clear();
    loginAsLawyer();
  });

  it('does not see Users nav item', async () => {
    server.use(http.get('/api/v1/cases', () => HttpResponse.json(EMPTY_LIST)));

    renderApp('/', <Route index element={<CasesPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Контрагенты')).toBeInTheDocument();
    });
    expect(screen.getByText('Отчёты')).toBeInTheDocument();
    expect(screen.queryByText('Пользователи')).not.toBeInTheDocument();
  });

  it('can see create case button', async () => {
    server.use(http.get('/api/v1/cases', () => HttpResponse.json(EMPTY_LIST)));

    renderApp('/cases', <Route path="cases" element={<CasesPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Дело')).toBeInTheDocument();
    });
  });

  it('can edit own case — sees Редактировать button', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () => HttpResponse.json({ data: CASES.own })),
      http.get('/api/v1/transfers', () => HttpResponse.json(EMPTY_LIST)),
    );

    renderApp('/cases/c1', <Route path="cases/:id" element={<CaseDetailPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Своё дело')).toBeInTheDocument();
    });
    expect(screen.getByText('Редактировать')).toBeInTheDocument();
  });

  it('cannot edit other lawyers case — no edit/transfer buttons', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () => HttpResponse.json({ data: CASES.other })),
      http.get('/api/v1/transfers', () => HttpResponse.json(EMPTY_LIST)),
    );

    renderApp('/cases/c2', <Route path="cases/:id" element={<CaseDetailPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Чужое дело')).toBeInTheDocument();
    });
    expect(screen.queryByText('Редактировать')).not.toBeInTheDocument();
    expect(screen.queryByText('Передать дело')).not.toBeInTheDocument();
  });

  it('cannot see manager report tabs', async () => {
    renderApp(
      '/reports',
      <Route path="reports" element={<ProtectedRoute roles={['admin', 'lawyer']} />}>
        <Route index element={<ReportsPage />} />
      </Route>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Недостаточно данных|Активные/)).toBeInTheDocument();
    });
    // Lawyer sees only "Мои показатели", no tab switcher for admin tabs
    expect(screen.queryByText('Нагрузка')).not.toBeInTheDocument();
    expect(screen.queryByText('Застой')).not.toBeInTheDocument();
    expect(screen.queryByText('Финансы')).not.toBeInTheDocument();
  });

  it('does not see delete case button', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () => HttpResponse.json({ data: CASES.own })),
      http.get('/api/v1/transfers', () => HttpResponse.json(EMPTY_LIST)),
    );

    renderApp('/cases/c1', <Route path="cases/:id" element={<CaseDetailPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Своё дело')).toBeInTheDocument();
    });
    // Trash icon button should not exist for lawyer (case:delete is admin-only)
    const trashButtons = screen.queryAllByTitle('');
    // More reliable: check that no trash icon container exists outside stage/hearing context
    expect(screen.queryByText('Удалить дело')).not.toBeInTheDocument();
  });
});
