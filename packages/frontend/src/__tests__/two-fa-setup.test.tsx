import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { renderWithProviders } from './renderWith';
import { Routes, Route } from 'react-router-dom';
import { UserProfilePage } from '../pages/UserProfilePage';

function loginAs(id: string, role: string, twoFaEnabled: boolean) {
  localStorage.setItem('accessToken', 'token');
  server.use(
    http.get('/api/v1/auth/me', () =>
      HttpResponse.json({
        data: { id, email: `${role}@test.ru`, role, firstName: 'Тест', lastName: 'Тестов', twoFaEnabled },
      }),
    ),
    http.get('/api/v1/notifications', () =>
      HttpResponse.json({ data: [], meta: { unreadCount: 0 } }),
    ),
    http.get(`/api/v1/users/${id}`, () =>
      HttpResponse.json({
        data: {
          id, email: `${role}@test.ru`, role, status: 'active',
          firstName: 'Тест', lastName: 'Тестов', twoFaEnabled,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
      }),
    ),
    http.get(`/api/v1/users/${id}/history`, () =>
      HttpResponse.json({ data: [] }),
    ),
  );
}

describe('2FA setup', () => {
  beforeEach(() => localStorage.clear());

  it('shows "Отключена" and setup button when 2FA is off', async () => {
    loginAs('u1', 'lawyer', false);

    renderWithProviders(
      <Routes><Route path="/users/:id" element={<UserProfilePage />} /></Routes>,
      { route: '/users/u1' },
    );

    await waitFor(() => {
      expect(screen.getByText('Двухфакторная аутентификация')).toBeInTheDocument();
    });
    expect(screen.getByText('Отключена')).toBeInTheDocument();
    expect(screen.getByText('Настроить 2FA')).toBeInTheDocument();
  });

  it('shows "Включена" when 2FA is already on', async () => {
    loginAs('u1', 'lawyer', true);

    renderWithProviders(
      <Routes><Route path="/users/:id" element={<UserProfilePage />} /></Routes>,
      { route: '/users/u1' },
    );

    await waitFor(() => {
      expect(screen.getByText('Двухфакторная аутентификация')).toBeInTheDocument();
    });
    expect(screen.getByText('Включена')).toBeInTheDocument();
    expect(screen.queryByText('Настроить 2FA')).not.toBeInTheDocument();
  });

  it('shows admin warning when 2FA is off for admin', async () => {
    loginAs('u1', 'admin', false);

    renderWithProviders(
      <Routes><Route path="/users/:id" element={<UserProfilePage />} /></Routes>,
      { route: '/users/u1' },
    );

    await waitFor(() => {
      expect(screen.getByText(/обязательна/i)).toBeInTheDocument();
    });
  });

  it('shows QR code after clicking setup', async () => {
    loginAs('u1', 'lawyer', false);
    server.use(
      http.post('/api/v1/auth/2fa/setup', () =>
        HttpResponse.json({ data: { qrCodeUrl: 'data:image/png;base64,QRFAKE', secret: 'JBSWY3DPEHPK3PXP' } }),
      ),
    );

    renderWithProviders(
      <Routes><Route path="/users/:id" element={<UserProfilePage />} /></Routes>,
      { route: '/users/u1' },
    );

    await waitFor(() => {
      expect(screen.getByText('Настроить 2FA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Настроить 2FA'));

    await waitFor(() => {
      expect(screen.getByAltText('QR-код 2FA')).toBeInTheDocument();
    });
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(screen.getByLabelText('Код из приложения')).toBeInTheDocument();
    expect(screen.getByText('Подтвердить')).toBeDisabled(); // code not entered yet
  });

  it('enables confirm button when 6 digits entered', async () => {
    loginAs('u1', 'lawyer', false);
    server.use(
      http.post('/api/v1/auth/2fa/setup', () =>
        HttpResponse.json({ data: { qrCodeUrl: 'data:image/png;base64,QR', secret: 'SECRET' } }),
      ),
    );

    renderWithProviders(
      <Routes><Route path="/users/:id" element={<UserProfilePage />} /></Routes>,
      { route: '/users/u1' },
    );

    await waitFor(() => expect(screen.getByText('Настроить 2FA')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Настроить 2FA'));

    await waitFor(() => expect(screen.getByLabelText('Код из приложения')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Код из приложения'), { target: { value: '123456' } });
    expect(screen.getByText('Подтвердить')).not.toBeDisabled();
  });

  it('cancel returns to idle state', async () => {
    loginAs('u1', 'lawyer', false);
    server.use(
      http.post('/api/v1/auth/2fa/setup', () =>
        HttpResponse.json({ data: { qrCodeUrl: 'data:image/png;base64,QR', secret: 'SECRET' } }),
      ),
    );

    renderWithProviders(
      <Routes><Route path="/users/:id" element={<UserProfilePage />} /></Routes>,
      { route: '/users/u1' },
    );

    await waitFor(() => expect(screen.getByText('Настроить 2FA')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Настроить 2FA'));
    await waitFor(() => expect(screen.getByText('Отмена')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Отмена'));

    await waitFor(() => {
      expect(screen.getByText('Настроить 2FA')).toBeInTheDocument();
    });
    expect(screen.queryByAltText('QR-код 2FA')).not.toBeInTheDocument();
  });

  it('does not show 2FA section on other user profile', async () => {
    loginAs('u-admin', 'admin', true);
    server.use(
      http.get('/api/v1/users/u-other', () =>
        HttpResponse.json({
          data: {
            id: 'u-other', email: 'other@test.ru', role: 'lawyer', status: 'active',
            firstName: 'Другой', lastName: 'Юзер', twoFaEnabled: false,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          },
        }),
      ),
      http.get('/api/v1/users/u-other/history', () => HttpResponse.json({ data: [] })),
    );

    renderWithProviders(
      <Routes><Route path="/users/:id" element={<UserProfilePage />} /></Routes>,
      { route: '/users/u-other' },
    );

    await waitFor(() => {
      expect(screen.getByText('Юзер Другой')).toBeInTheDocument();
    });
    expect(screen.queryByText('Двухфакторная аутентификация')).not.toBeInTheDocument();
  });
});
