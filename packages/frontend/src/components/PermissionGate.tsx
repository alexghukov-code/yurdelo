import { useAuth } from '../hooks/useAuth';

interface PermissionGateProps {
  roles: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({ roles, fallback = null, children }: PermissionGateProps) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <>{fallback}</>;
  return <>{children}</>;
}
