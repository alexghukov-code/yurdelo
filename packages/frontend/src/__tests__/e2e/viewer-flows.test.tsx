import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../renderWith';
import { Routes, Route } from 'react-router-dom';
import { USERS, CASES, EMPTY_LIST, EMPTY_NOTIFICATIONS } from '../mocks/fixtures';
import { AppShell } from '../../components/AppShell';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { CasesPage } from '../../pages/CasesPage';
import { CaseDetailPage } from '../../pages/CaseDetailPage';
import { ReportsPage } from '../../pages/ReportsPage';
import { CaseCreatePage } from '../../pages/CaseCreatePage';

function loginAsViewer() {
  localStorage.setItem('accessToken', 'viewer-token');
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ data: USERS.viewer })),
    http.get('/api/v1/notifications', () => HttpResponse.json(EMPTY_NOTIFICATIONS)),
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

describe('Viewer flows', () => {
  beforeEach(() => {
    localStorage.clear();
    loginAsViewer();
  });

  it('does not see create case button', async () => {
    server.use(http.get('/api/v1/cases', () => HttpResponse.json(EMPTY_LIST)));

    renderApp('/cases', <Route path="cases" element={<CasesPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Контрагенты')).toBeInTheDocument(); // sidebar loaded
    });
    // The + Дело button should not exist for viewer
    const buttons = screen.queryAllByRole('button');
    const createBtn = buttons.find(
      (b) => b.textContent?.includes('Дело') && b.textContent?.includes('+'),
    );
    expect(createBtn).toBeUndefined();
  });

  it('does not see Reports or Users in sidebar', async () => {
    server.use(http.get('/api/v1/cases', () => HttpResponse.json(EMPTY_LIST)));

    renderApp('/cases', <Route path="cases" element={<CasesPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Контрагенты')).toBeInTheDocument();
    });
    expect(screen.queryByText('Отчёты')).not.toBeInTheDocument();
    expect(screen.queryByText('Пользователи')).not.toBeInTheDocument();
  });

  it('cannot see edit/transfer/status buttons on case detail', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () => HttpResponse.json({ data: CASES.own })),
      http.get('/api/v1/transfers', () => HttpResponse.json(EMPTY_LIST)),
    );

    renderApp('/cases/c1', <Route path="cases/:id" element={<CaseDetailPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Своё дело')).toBeInTheDocument();
    });
    expect(screen.queryByText('Редактировать')).not.toBeInTheDocument();
    expect(screen.queryByText('Передать дело')).not.toBeInTheDocument();
  });

  it('can see case detail read-only (name, parties, stages)', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () => HttpResponse.json({ data: CASES.own })),
      http.get('/api/v1/transfers', () => HttpResponse.json(EMPTY_LIST)),
    );

    renderApp('/cases/c1', <Route path="cases/:id" element={<CaseDetailPage />} />);

    await waitFor(() => {
      expect(screen.getByText('Своё дело')).toBeInTheDocument();
    });
    expect(screen.getByText('1-я инстанция')).toBeInTheDocument();
    expect(screen.getByText(/ООО Альфа/)).toBeInTheDocument();
  });

  it('blocked from /cases/new by route guard', async () => {
    renderApp(
      '/cases/new',
      <Route path="cases/new" element={<ProtectedRoute roles={['admin', 'lawyer']} />}>
        <Route index element={<CaseCreatePage />} />
      </Route>,
    );

    await waitFor(() => {
      expect(screen.getByText('Нет доступа')).toBeInTheDocument();
    });
  });

  it('blocked from /reports by route guard', async () => {
    renderApp(
      '/reports',
      <Route path="reports" element={<ProtectedRoute roles={['admin', 'lawyer']} />}>
        <Route index element={<ReportsPage />} />
      </Route>,
    );

    await waitFor(() => {
      expect(screen.getByText('Нет доступа')).toBeInTheDocument();
    });
  });

  it('cannot see upload/delete buttons on documents', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () => HttpResponse.json({ data: CASES.own })),
      http.get('/api/v1/transfers', () => HttpResponse.json(EMPTY_LIST)),
    );

    renderApp('/cases/c1', <Route path="cases/:id" element={<CaseDetailPage />} />);

    await waitFor(() => {
      expect(screen.getByText('contract.pdf')).toBeInTheDocument();
    });
    // No upload or delete buttons for viewer
    expect(screen.queryByText('Файл')).not.toBeInTheDocument();
  });
});
