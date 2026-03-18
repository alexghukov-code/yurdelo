import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Skeleton } from './Skeleton';
import { ForbiddenState } from './ForbiddenState';

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
    return <ForbiddenState />;
  }

  return <Outlet />;
}

// Re-export for backwards compatibility
export { ForbiddenState as AccessDenied } from './ForbiddenState';
