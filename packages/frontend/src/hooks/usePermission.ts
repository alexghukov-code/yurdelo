import { useAuth } from './useAuth';
import { can, type Permission } from '../lib/permissions';

export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return can(user.role, permission);
}
