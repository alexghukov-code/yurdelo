import { http, HttpResponse } from 'msw';

// Configurable response overrides — tests can push handlers onto this
export const handlers = [
  // Default: /auth/me returns 401 (not logged in)
  http.get('/api/v1/auth/me', () => {
    return HttpResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация.' } },
      { status: 401 },
    );
  }),

  // Default: /auth/refresh returns 401 (no valid refresh token)
  http.post('/api/v1/auth/refresh', () => {
    return HttpResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Refresh token отсутствует.' } },
      { status: 401 },
    );
  }),

  // Default: /auth/login returns 401 (wrong password)
  http.post('/api/v1/auth/login', () => {
    return HttpResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Неверный email или пароль.' } },
      { status: 401 },
    );
  }),

  // Default: /notifications returns empty
  http.get('/api/v1/notifications', () => {
    return HttpResponse.json({ data: [], meta: { unreadCount: 0 } });
  }),

  // Default: /cases returns empty
  http.get('/api/v1/cases', () => {
    return HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  }),

  // Default: /reports/my
  http.get('/api/v1/reports/my', () => {
    return HttpResponse.json({
      data: {
        load: { activeCases: 0, closedCases: 0, totalCases: 0 },
        results: { wins: 0, losses: 0, partial: 0, decided: 0, winRate: null },
      },
    });
  }),
];
