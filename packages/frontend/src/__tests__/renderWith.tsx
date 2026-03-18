import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, useAuthProvider } from '../hooks/useAuth';

interface Options {
  route?: string;
}

export function renderWithProviders(
  ui: React.ReactElement,
  opts: Options = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function AuthWrapper({ children }: { children: React.ReactNode }) {
    const auth = useAuthProvider();
    return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[opts.route ?? '/']}>
          <AuthWrapper>{children}</AuthWrapper>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  const result = render(ui, { wrapper: Wrapper });
  return { ...result, queryClient };
}
