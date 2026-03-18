import api from './client';
import type { ListMeta } from './cases';

export interface Party {
  id: string;
  name: string;
  inn?: string;
  ogrn?: string;
  address?: string;
  phone?: string;
  email?: string;
  isPlaintiff?: boolean;
  isDefendant?: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchParties(params?: { search?: string; page?: number; limit?: number }) {
  const { data } = await api.get<{ data: Party[]; meta: ListMeta }>('/parties', { params });
  return data;
}

export async function fetchParty(id: string) {
  const { data } = await api.get<{ data: Party }>(`/parties/${id}`);
  return data.data;
}

export async function createParty(body: Partial<Party>) {
  const { data } = await api.post<{ data: Party }>('/parties', body);
  return data.data;
}

export async function updateParty(id: string, body: Partial<Party> & { updatedAt: string }) {
  const { data } = await api.patch<{ data: Party }>(`/parties/${id}`, body);
  return data.data;
}

export async function deleteParty(id: string) {
  await api.delete(`/parties/${id}`);
}
