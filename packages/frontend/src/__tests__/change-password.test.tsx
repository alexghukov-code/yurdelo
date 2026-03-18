import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { renderWithProviders } from './renderWith';
import { Routes, Route } from 'react-router-dom';
import { UserProfilePage } from '../pages/UserProfilePage';

function loginAs(role: 'admin' | 'lawyer' | 'viewer', id = 'u1') {
  localStorage.setItem('accessToken', 'token');
  server.use(
    http.get('/api/v1/auth/me', () =>
      HttpResponse.json({
        data: {
          id,
          email: `${role}@test.ru`,
          role,
          firstName: 'Тест',
          lastName: 'Тестов',
          twoFaEnabled: false,
        },
      }),
    ),
    http.get('/api/v1/notifications', () =>
      HttpResponse.json({ data: [], meta: { unreadCount: 0 } }),
    ),
  );
}

function mockProfile(id: string, role: string) {
  server.use(
    http.get(`/api/v1/users/${id}`, () =>
      HttpResponse.json({
        data: {
          id,
          email: `${role}@test.ru`,
          role,
          status: 'active',
          firstName: 'Тест',
          lastName: 'Тестов',
          twoFaEnabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    ),
    http.get(`/api/v1/users/${id}/history`, () => HttpResponse.json({ data: [] })),
  );
}

describe('Change password', () => {
  beforeEach(() => localStorage.clear());

  it('shows change password form on own profile', async () => {
    loginAs('lawyer', 'u1');
    mockProfile('u1', 'lawyer');

    renderWithProviders(
      <Routes>
        <Route path="/users/:id" element={<UserProfilePage />} />
      </Routes>,
      { route: '/users/u1' },
    );

    await waitFor(() => {
      expect(screen.getByText('Смена пароля')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Текущий пароль')).toBeInTheDocument();
    expect(screen.getByLabelText('Новый пароль')).toBeInTheDocument();
    expect(screen.getByLabelText('Подтверждение')).toBeInTheDocument();
  });

  it('does not show change password on other user profile', async () => {
    loginAs('admin', 'u-admin');
    mockProfile('u-other', 'lawyer');

    renderWithProviders(
      <Routes>
        <Route path="/users/:id" element={<UserProfilePage />} />
      </Routes>,
      { route: '/users/u-other' },
    );

    await waitFor(() => {
      expect(screen.getByText('Тестов Тест')).toBeInTheDocument();
    });
    expect(screen.queryByText('Смена пароля')).not.toBeInTheDocument();
  });

  it('validates password mismatch', async () => {
    loginAs('lawyer', 'u1');
    mockProfile('u1', 'lawyer');

    renderWithProviders(
      <Routes>
        <Route path="/users/:id" element={<UserProfilePage />} />
      </Routes>,
      { route: '/users/u1' },
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Текущий пароль')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'OldPass1' } });
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'NewPass1' } });
    fireEvent.change(screen.getByLabelText('Подтверждение'), { target: { value: 'Mismatch1' } });
    fireEvent.click(screen.getByText('Изменить пароль'));

    await waitFor(() => {
      expect(screen.getByText('Пароли не совпадают.')).toBeInTheDocument();
    });
  });

  it('validates min length', async () => {
    loginAs('lawyer', 'u1');
    mockProfile('u1', 'lawyer');

    renderWithProviders(
      <Routes>
        <Route path="/users/:id" element={<UserProfilePage />} />
      </Routes>,
      { route: '/users/u1' },
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Новый пароль')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'OldPass1' } });
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'ab1' } });
    fireEvent.change(screen.getByLabelText('Подтверждение'), { target: { value: 'ab1' } });
    fireEvent.click(screen.getByText('Изменить пароль'));

    await waitFor(() => {
      expect(screen.getByText('Минимум 8 символов.')).toBeInTheDocument();
    });
  });

  it('validates letter + digit requirement', async () => {
    loginAs('lawyer', 'u1');
    mockProfile('u1', 'lawyer');

    renderWithProviders(
      <Routes>
        <Route path="/users/:id" element={<UserProfilePage />} />
      </Routes>,
      { route: '/users/u1' },
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Новый пароль')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'OldPass1' } });
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'abcdefgh' } });
    fireEvent.change(screen.getByLabelText('Подтверждение'), { target: { value: 'abcdefgh' } });
    fireEvent.click(screen.getByText('Изменить пароль'));

    await waitFor(() => {
      expect(screen.getByText('Буква + цифра обязательны.')).toBeInTheDocument();
    });
  });
});
