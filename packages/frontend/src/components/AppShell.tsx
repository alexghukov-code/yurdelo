import { useAuth } from '../hooks/useAuth';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ContentLayout } from './ContentLayout';

export function AppShell() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role={user.role} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          firstName={user.firstName}
          lastName={user.lastName}
          role={user.role}
          onLogout={logout}
        />
        <ContentLayout />
      </div>
    </div>
  );
}
