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
          id: 'u1',
          email: 'lawyer@test.ru',
          role: 'lawyer',
          firstName: 'Мария',
          lastName: 'Петрова',
          twoFaEnabled: false,
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

describe('CaseDetailPage edge cases', () => {
  it('claimAmount=0 displays as "0 ₽", not "—"', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () =>
        HttpResponse.json({
          data: {
            id: 'c1', name: 'Дело', category: 'civil', status: 'active',
            finalResult: null, claimAmount: 0, lawyerId: 'u1',
            pltId: 'p1', defId: 'p2', pltName: 'Альфа', defName: 'Бета',
            lawyerName: 'Петрова Мария', closedAt: null,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            stages: [],
          },
        }),
      ),
      http.get('/api/v1/transfers', () =>
        HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
      ),
      http.get('/api/v1/notifications', () =>
        HttpResponse.json({ data: [], meta: { unreadCount: 0 } }),
      ),
    );

    renderCaseDetail('c1');

    await waitFor(() => {
      expect(screen.getByText('Дело')).toBeInTheDocument();
    });
    expect(screen.getByText('0 ₽')).toBeInTheDocument();
  });

  it('claimAmount=null displays as "—"', async () => {
    server.use(
      http.get('/api/v1/cases/:id', () =>
        HttpResponse.json({
          data: {
            id: 'c2', name: 'Дело 2', category: 'civil', status: 'active',
            finalResult: null, claimAmount: null, lawyerId: 'u1',
            pltId: 'p1', defId: 'p2', pltName: 'Альфа', defName: 'Бета',
            lawyerName: 'Петрова Мария', closedAt: null,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            stages: [],
          },
        }),
      ),
      http.get('/api/v1/transfers', () =>
        HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
      ),
      http.get('/api/v1/notifications', () =>
        HttpResponse.json({ data: [], meta: { unreadCount: 0 } }),
      ),
    );

    renderCaseDetail('c2');

    await waitFor(() => {
      expect(screen.getByText('Дело 2')).toBeInTheDocument();
    });
    // "—" is displayed for the claim amount info card
    const infoCards = document.querySelectorAll('.bg-white.rounded-lg.shadow.px-4.py-3');
    const amountCard = Array.from(infoCards).find((c) => c.textContent?.includes('Цена иска'));
    expect(amountCard?.textContent).toContain('—');
  });
});

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
      expect(screen.getByText(/не найден/i)).toBeInTheDocument();
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
      expect(screen.getByText(/Не удалось загрузить/)).toBeInTheDocument();
    });

    // Retry button IS present for 500
    expect(screen.getByText(/Повторить/)).toBeInTheDocument();
  });
});
