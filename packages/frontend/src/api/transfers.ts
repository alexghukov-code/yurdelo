import api from './client';
import type { ListMeta } from './cases';

export interface Transfer {
  id: string;
  caseId: string;
  fromId: string;
  toId: string;
  fromName?: string;
  toName?: string;
  caseName?: string;
  transferDate: string;
  comment: string | null;
  createdAt: string;
}

export async function fetchTransfers(caseId: string) {
  const { data } = await api.get<{ data: Transfer[]; meta: ListMeta }>('/transfers', {
    params: { caseId, limit: 100 },
  });
  return data.data;
}

export async function createTransfer(body: { caseId: string; toId: string; comment?: string }) {
  const { data } = await api.post<{ data: Transfer }>('/transfers', body);
  return data.data;
}
