import api from './client';
import type { ListMeta } from './cases';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  role: string;
  status: string;
  // admin-only fields (backend omits for non-admin)
  email?: string;
  phone?: string;
  twoFaEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserHistory {
  id: string;
  event: string;
  eventDate: string;
  comment: string | null;
  performedBy: string | null;
  createdAt: string;
}

export async function fetchUsers(params?: {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
}) {
  const { data } = await api.get<{ data: User[]; meta: ListMeta }>('/users', { params });
  return data;
}

export async function fetchUser(id: string) {
  const { data } = await api.get<{ data: User }>(`/users/${id}`);
  return data.data;
}

export async function updateUser(id: string, body: Record<string, unknown> & { updatedAt: string }) {
  const { data } = await api.patch<{ data: User }>(`/users/${id}`, body);
  return data.data;
}

export async function fetchUserHistory(id: string) {
  const { data } = await api.get<{ data: UserHistory[] }>(`/users/${id}/history`);
  return data.data;
}

export async function createUser(body: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  role: string;
  phone?: string;
}) {
  const { data } = await api.post<{ data: User }>('/users', body);
  return data.data;
}

export async function deactivateUser(id: string, body: {
  date: string;
  reason: string;
  comment?: string;
  transferToId?: string;
}) {
  const { data } = await api.post<{ data: { message: string } }>(`/users/${id}/deactivate`, body);
  return data.data;
}

export async function restoreUser(id: string, body: {
  date: string;
  role: string;
  comment?: string;
}) {
  const { data } = await api.post<{ data: { message: string } }>(`/users/${id}/restore`, body);
  return data.data;
}

export async function fetchActiveLawyers() {
  const { data } = await api.get<{ data: User[]; meta: ListMeta }>('/users', {
    params: { status: 'active', role: 'lawyer', limit: 100 },
  });
  return data.data;
}
