import { useAuth } from '../hooks/useAuth';
import { can, type Permission } from '../lib/permissions';

interface PermissionGateProps {
  /** Permission key from the centralized map */
  allow?: Permission;
  /** Direct role list (legacy, prefer `allow`) */
  roles?: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({ allow, roles, fallback = null, children }: PermissionGateProps) {
  const { user } = useAuth();
  if (!user) return <>{fallback}</>;

  if (allow && !can(user.role, allow)) return <>{fallback}</>;
  if (roles && !roles.includes(user.role)) return <>{fallback}</>;

  return <>{children}</>;
}
