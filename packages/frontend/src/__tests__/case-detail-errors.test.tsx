/**
 * Bug 5: CaseDetailPage showed generic error for 403/404.
 * Fix: Distinct error messages without "Retry" button.
 */
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { renderWithProviders } from './renderWith';
import { Routes, Route } from 'react-router-dom';
import { CaseDetailPage } from '../pages/CaseDetailPage';

function renderCaseDetail(caseId: string) {
  // Mock authenticated user
  localStorage.setItem('accessToken', 'valid-token');

  server.use(
    http.get('/api/v1/auth/me', () => {
      return HttpResponse.json({
        data: {
          id: 'u1', email: 'lawyer@test.ru', role: 'lawyer',
          firstName: 'Мария', lastName: 'Петрова', twoFaEnabled: false,
        },
      });
    }),
  );

  return renderWithProviders(
    <Routes>
      <Route path="/cases/:id" element={<CaseDetailPage />} />
    </Routes>,
    { route: `/cases/${caseId}` },
  );
}

describe('CaseDetailPage error handling (bug #5)', () => {
  it('shows "Нет доступа" on 403 without retry button', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () => {
        return HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Нет прав.' } },
          { status: 403 },
        );
      }),
    );

    renderCaseDetail('case-403');

    await waitFor(() => {
      expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    });

    // No retry button for 403
    expect(screen.queryByText(/Повторить/)).not.toBeInTheDocument();
  });

  it('shows "Дело не найдено" on 404 without retry button', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () => {
        return HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Не найдено.' } },
          { status: 404 },
        );
      }),
    );

    renderCaseDetail('case-404');

    await waitFor(() => {
      expect(screen.getByText(/Дело не найдено/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Повторить/)).not.toBeInTheDocument();
  });

  it('shows generic error with retry button on 500', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () => {
        return HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Сервер.' } },
          { status: 500 },
        );
      }),
    );

    renderCaseDetail('case-500');

    await waitFor(() => {
      expect(screen.getByText(/Не удалось загрузить дело/)).toBeInTheDocument();
    });

    // Retry button IS present for 500
    expect(screen.getByText(/Повторить/)).toBeInTheDocument();
  });
});
