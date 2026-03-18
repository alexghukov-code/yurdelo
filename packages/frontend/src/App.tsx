import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import toast, { Toaster } from 'react-hot-toast';
import { isStaleDataError, extractError, getRetryAfter } from './api/client';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CasesPage } from './pages/CasesPage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { PartiesPage } from './pages/PartiesPage';
import { CalendarPage } from './pages/CalendarPage';
import { CaseCreatePage } from './pages/CaseCreatePage';
import { UsersPage } from './pages/UsersPage';
import { NotFoundPage } from './pages/NotFoundPage';

function handleMutationError(err: unknown) {
  if (isStaleDataError(err)) {
    toast.error('Данные изменены другим пользователем. Обновите страницу.');
    return;
  }
  const retryAfter = getRetryAfter(err);
  if (retryAfter !== undefined) {
    toast.error(`Слишком много запросов. Повторите через ${retryAfter} сек.`);
    return;
  }
  toast.error(extractError(err).message);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    mutations: { onError: handleMutationError },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="cases" element={<CasesPage />} />
                <Route path="cases/new" element={<ProtectedRoute roles={['admin', 'lawyer']} />}>
                  <Route index element={<CaseCreatePage />} />
                </Route>
                <Route path="cases/:id" element={<CaseDetailPage />} />
                <Route path="parties" element={<PartiesPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="users" element={<UsersPage />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthProvider();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
