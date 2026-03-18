import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Skeleton } from './Skeleton';

interface Props {
  roles?: string[];
}

export function ProtectedRoute({ roles }: Props) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!user) {
    const returnTo = location.pathname + location.search;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <AccessDenied />;
  }

  return <Outlet />;
}

export function AccessDenied() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Нет доступа</h1>
        <p className="mt-2 text-gray-500">Обратитесь к руководителю.</p>
      </div>
    </div>
  );
}
