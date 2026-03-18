import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';

interface TopbarProps {
  firstName: string;
  lastName: string;
  role: string;
  onLogout: () => void;
}

export function Topbar({ firstName, lastName, role, onLogout }: TopbarProps) {
  return (
    <header className="h-14 bg-white border-b flex items-center justify-end px-6 gap-4">
      <NotificationBell />
      <UserMenu
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={onLogout}
      />
    </header>
  );
}
