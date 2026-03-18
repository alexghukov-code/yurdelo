import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchNotifications, markRead, markAllRead } from '../api/notifications';

export function useNotifications(limit = 20) {
  const hasToken = !!localStorage.getItem('accessToken');

  return useQuery({
    queryKey: ['notifications', { limit }],
    queryFn: () => fetchNotifications({ limit }),
    enabled: hasToken,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false, // stop polling when tab is hidden
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
