import api from './client';

export interface Case {
  id: string;
  name: string;
  category: string;
  status: string;
  finalResult: string | null;
  claimAmount: number | null;
  lawyerId: string;
  pltId: string;
  defId: string;
  pltName?: string;
  defName?: string;
  lawyerName?: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stages?: Stage[];
}

export interface Stage {
  id: string;
  stageTypeId: string;
  stageTypeName: string;
  sortOrder: number;
  court: string;
  caseNumber: string;
  hearings: Hearing[];
  createdAt: string;
  updatedAt: string;
}

export interface Hearing {
  id: string;
  stageId: string;
  type: string;
  datetime: string;
  result: string | null;
  appealed: boolean | null;
  newDatetime: string | null;
  adjReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function fetchCases(params: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) {
  const { data } = await api.get<{ data: Case[]; meta: ListMeta }>('/cases', { params });
  return data;
}

export async function fetchCase(id: string) {
  const { data } = await api.get<{ data: Case }>(`/cases/${id}`);
  return data.data;
}

export async function createCase(body: {
  name: string;
  pltId: string;
  defId: string;
  category: string;
  claimAmount?: number;
}) {
  const { data } = await api.post<{ data: Case }>('/cases', body);
  return data.data;
}

export async function updateCase(
  id: string,
  body: Record<string, unknown> & { updatedAt: string },
) {
  const { data } = await api.patch<{ data: Case }>(`/cases/${id}`, body);
  return data.data;
}

export async function updateCaseStatus(
  id: string,
  body: { status: string; updatedAt: string },
) {
  const { data } = await api.patch<{ data: Case }>(`/cases/${id}/status`, body);
  return data;
}

export async function setCaseFinalResult(
  id: string,
  body: { finalResult: string; updatedAt: string },
) {
  const { data } = await api.patch<{ data: Case }>(`/cases/${id}/final-result`, body);
  return data.data;
}

export async function deleteCase(id: string) {
  await api.delete(`/cases/${id}`);
}
