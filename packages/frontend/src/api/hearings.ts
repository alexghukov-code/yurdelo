import api from './client';

export async function createHearing(stageId: string, body: {
  type: string;
  datetime: string;
  result?: string;
  appealed?: boolean;
  newDatetime?: string;
  adjReason?: string;
  notes?: string;
}) {
  const { data } = await api.post(`/stages/${stageId}/hearings`, body);
  return data.data;
}

export async function updateHearing(id: string, body: Record<string, unknown> & { updatedAt: string }) {
  const { data } = await api.patch(`/hearings/${id}`, body);
  return data.data;
}
