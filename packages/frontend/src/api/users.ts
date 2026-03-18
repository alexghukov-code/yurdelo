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

export async function fetchUsers(params?: {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
}) {
  const { data } = await api.get<{ data: User[]; meta: ListMeta }>('/users', { params });
  return data;
}
