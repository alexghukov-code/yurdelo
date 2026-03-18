import api from './client';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'lawyer' | 'viewer';
  firstName: string;
  lastName: string;
  middleName?: string;
  twoFaEnabled: boolean;
}

export interface LoginPayload {
  email: string;
  password: string;
  totp_code?: string;
}

export async function login(payload: LoginPayload) {
  const { data } = await api.post<{ data: { accessToken: string; user: User } }>(
    '/auth/login',
    payload,
  );
  localStorage.setItem('accessToken', data.data.accessToken);
  return data.data.user;
}

export async function logout() {
  await api.post('/auth/logout');
  localStorage.removeItem('accessToken');
}

export async function fetchMe() {
  const { data } = await api.get<{ data: User }>('/auth/me');
  return data.data;
}

export async function changePassword(body: { oldPassword: string; newPassword: string }) {
  const { data } = await api.post<{ data: { message: string } }>('/auth/change-password', body);
  return data.data;
}

export async function setup2fa() {
  const { data } = await api.post<{ data: { qrCodeUrl: string; secret: string } }>(
    '/auth/2fa/setup',
  );
  return data.data;
}

export async function verify2fa(code: string) {
  const { data } = await api.post<{ data: { message: string } }>('/auth/2fa/verify', { code });
  return data.data;
}
