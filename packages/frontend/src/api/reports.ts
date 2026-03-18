import api from './client';

export async function fetchManagerReport(tab: string) {
  const { data } = await api.get('/reports/manager', { params: { tab } });
  return data.data;
}

export async function fetchCasesReport(tab: string, dateFrom?: string, dateTo?: string) {
  const { data } = await api.get('/reports/cases', { params: { tab, dateFrom, dateTo } });
  return data.data;
}

export async function fetchMyReport() {
  const { data } = await api.get('/reports/my');
  return data.data;
}

export interface CalendarEvent {
  id: string;
  type: string;
  datetime: string;
  result: string | null;
  court: string;
  caseNumber: string;
  caseId: string;
  caseName: string;
  lawyerId: string;
}

export async function fetchCalendar(year: number, month: number) {
  const { data } = await api.get<{ data: CalendarEvent[] }>('/reports/calendar', {
    params: { year, month },
  });
  return data.data;
}
