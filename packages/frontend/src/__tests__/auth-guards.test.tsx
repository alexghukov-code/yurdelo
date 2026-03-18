import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { renderWithProviders } from './renderWith';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { PermissionGate } from '../components/PermissionGate';
import { LoginPage } from '../pages/LoginPage';

function mockUser(role: 'admin' | 'lawyer' | 'viewer') {
  localStorage.setItem('accessToken', 'valid-token');
  server.use(
    http.get('/api/v1/auth/me', () =>
      HttpResponse.json({
        data: {
          id: 'u1',
          email: `${role}@test.ru`,
          role,
          firstName: 'Тест',
          lastName: 'Тестов',
          twoFaEnabled: false,
        },
      }),
    ),
  );
}

function mockNoUser() {
  localStorage.removeItem('accessToken');
  server.use(
    http.get('/api/v1/auth/me', () =>
      HttpResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }),
    ),
  );
}

// ═══════════════════════════════════════════════════════
// ProtectedRoute: redirect to /login with returnTo
// ═══════════════════════════════════════════════════════

describe('ProtectedRoute', () => {
  beforeEach(() => localStorage.clear());

  it('returnTo contains only pathname, no query params (security)', async () => {
    mockNoUser();

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/cases" element={<div>Cases</div>} />
        </Route>
      </Routes>,
      { route: '/cases?secret=abc123' },
    );

    await waitFor(() => {
      expect(screen.getByText('Войти')).toBeInTheDocument();
    });
    // returnTo should NOT contain query params — security risk
    // LoginPage is rendered at /login?returnTo=%2Fcases (no ?secret=abc123)
  });

  it('redirects unauthenticated user to /login with returnTo', async () => {
    mockNoUser();

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/cases/:id" element={<div>Case Detail</div>} />
        </Route>
      </Routes>,
      { route: '/cases/abc-123' },
    );

    await waitFor(() => {
      // LoginPage should render (redirected from /cases/abc-123)
      expect(screen.getByText('Войти')).toBeInTheDocument();
    });
  });

  it('shows access denied when role is not allowed', async () => {
    mockUser('viewer');

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="/admin" element={<div>Admin Page</div>} />
        </Route>
      </Routes>,
      { route: '/admin' },
    );

    await waitFor(() => {
      expect(screen.getByText('Нет доступа')).toBeInTheDocument();
    });
    expect(screen.queryByText('Admin Page')).not.toBeInTheDocument();
  });

  it('renders children when role matches', async () => {
    mockUser('admin');

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="/admin" element={<div>Admin Page</div>} />
        </Route>
      </Routes>,
      { route: '/admin' },
    );

    await waitFor(() => {
      expect(screen.getByText('Admin Page')).toBeInTheDocument();
    });
  });

  it('renders children when no roles specified (any authenticated user)', async () => {
    mockUser('viewer');

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Route>
      </Routes>,
      { route: '/dashboard' },
    );

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════
// PermissionGate: conditional rendering by role
// ═══════════════════════════════════════════════════════

describe('PermissionGate', () => {
  beforeEach(() => localStorage.clear());

  it('renders children when role matches (legacy roles prop)', async () => {
    mockUser('admin');

    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <PermissionGate roles={['admin', 'lawyer']}>
              <button>Create</button>
            </PermissionGate>
          }
        />
      </Routes>,
    );

    await waitFor(() => {
      expect(screen.getByText('Create')).toBeInTheDocument();
    });
  });

  it('hides children when role does not match (legacy roles prop)', async () => {
    mockUser('viewer');

    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <div>
              <span>Page</span>
              <PermissionGate roles={['admin', 'lawyer']}>
                <button>Create</button>
              </PermissionGate>
            </div>
          }
        />
      </Routes>,
    );

    await waitFor(() => {
      expect(screen.getByText('Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Create')).not.toBeInTheDocument();
  });

  it('renders fallback when role does not match', async () => {
    mockUser('viewer');

    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <PermissionGate allow="case:delete" fallback={<span>Read only</span>}>
              <button>Delete</button>
            </PermissionGate>
          }
        />
      </Routes>,
    );

    await waitFor(() => {
      expect(screen.getByText('Read only')).toBeInTheDocument();
    });
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('allow prop: admin can create case', async () => {
    mockUser('admin');

    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <PermissionGate allow="case:create">
              <button>+ Дело</button>
            </PermissionGate>
          }
        />
      </Routes>,
    );

    await waitFor(() => {
      expect(screen.getByText('+ Дело')).toBeInTheDocument();
    });
  });

  it('allow prop: viewer cannot create case', async () => {
    mockUser('viewer');

    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <div>
              <span>Page</span>
              <PermissionGate allow="case:create">
                <button>+ Дело</button>
              </PermissionGate>
            </div>
          }
        />
      </Routes>,
    );

    await waitFor(() => {
      expect(screen.getByText('Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('+ Дело')).not.toBeInTheDocument();
  });

  it('allow prop: lawyer cannot delete case', async () => {
    mockUser('lawyer');

    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <div>
              <span>Page</span>
              <PermissionGate allow="case:delete">
                <button>Удалить</button>
              </PermissionGate>
            </div>
          }
        />
      </Routes>,
    );

    await waitFor(() => {
      expect(screen.getByText('Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Удалить')).not.toBeInTheDocument();
  });
});
