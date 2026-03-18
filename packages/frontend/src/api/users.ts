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
