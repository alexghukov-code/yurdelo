import { createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { login as apiLogin, logout as apiLogout, fetchMe, type User, type LoginPayload } from '../api/auth';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<User>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthProvider(): AuthContextValue {
  const qc = useQueryClient();

  const { data: user = null, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: apiLogin,
    onSuccess: (u) => qc.setQueryData(['auth', 'me'], u),
  });

  const logoutMutation = useMutation({
    mutationFn: apiLogout,
    onSuccess: () => {
      qc.setQueryData(['auth', 'me'], null);
      qc.clear();
    },
  });

  return {
    user,
    isLoading,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
  };
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
