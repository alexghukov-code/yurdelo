import api from './client';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

export async function fetchNotifications(params?: { is_read?: string; limit?: number }) {
  const { data } = await api.get<{ data: Notification[]; meta: { unreadCount: number } }>(
    '/notifications',
    { params },
  );
  return data;
}

export async function markRead(id: string) {
  await api.patch(`/notifications/${id}/read`);
}

export async function markAllRead() {
  await api.patch('/notifications/read-all');
}
