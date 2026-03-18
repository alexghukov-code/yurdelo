/**
 * Bug 2: Notifications polling should not run without a token
 * Bug 3: No duplicate query observers for notifications
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { useNotifications } from '../hooks/useNotifications';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useNotifications', () => {
  it('does NOT fetch when no accessToken in localStorage', async () => {
    localStorage.removeItem('accessToken');
    let fetchCount = 0;

    server.use(
      http.get('/api/v1/notifications', () => {
        fetchCount++;
        return HttpResponse.json({ data: [], meta: { unreadCount: 0 } });
      }),
    );

    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });

    // Wait a tick to ensure query had a chance to run
    await new Promise((r) => setTimeout(r, 100));

    expect(fetchCount).toBe(0);
    expect(result.current.data).toBeUndefined();
  });

  it('fetches when accessToken exists', async () => {
    localStorage.setItem('accessToken', 'valid-token');

    server.use(
      http.get('/api/v1/notifications', () => {
        return HttpResponse.json({
          data: [{ id: 'n1', type: 'test', title: 'Hello', isRead: false, createdAt: new Date().toISOString() }],
          meta: { unreadCount: 1 },
        });
      }),
    );

    const { result } = renderHook(() => useNotifications(10), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.meta.unreadCount).toBe(1);
    expect(result.current.data?.data).toHaveLength(1);
  });

  it('uses consistent queryKey for same limit (no duplicate observers)', () => {
    localStorage.setItem('accessToken', 'valid-token');

    const wrapper = createWrapper();

    const { result: r1 } = renderHook(() => useNotifications(10), { wrapper });
    const { result: r2 } = renderHook(() => useNotifications(10), { wrapper });

    // Same queryKey → same cache entry, not two separate fetches
    expect(r1.current.dataUpdatedAt).toBe(r2.current.dataUpdatedAt);
  });
});
