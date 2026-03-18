import api from './client';

export interface StageType {
  id: string;
  name: string;
  sortOrder: number;
}

export const STAGE_TYPES: StageType[] = [
  { id: 'a0000000-0000-0000-0000-000000000001', name: 'Досудебная', sortOrder: 1 },
  { id: 'a0000000-0000-0000-0000-000000000002', name: '1-я инстанция', sortOrder: 2 },
  { id: 'a0000000-0000-0000-0000-000000000003', name: 'Апелляция', sortOrder: 3 },
  { id: 'a0000000-0000-0000-0000-000000000004', name: 'Кассация', sortOrder: 4 },
];

export async function createStage(caseId: string, body: {
  stageTypeId: string;
  sortOrder: number;
  court: string;
  caseNumber: string;
}) {
  const { data } = await api.post(`/cases/${caseId}/stages`, body);
  return data.data;
}

export async function updateStage(id: string, body: Record<string, unknown> & { updatedAt: string }) {
  const { data } = await api.patch(`/stages/${id}`, body);
  return data.data;
}
