import { Menu } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';

interface TopbarProps {
  firstName: string;
  lastName: string;
  role: string;
  onLogout: () => void;
  onMenuClick: () => void;
}

export function Topbar({ firstName, lastName, role, onLogout, onMenuClick }: TopbarProps) {
  return (
    <header className="h-14 bg-white border-b flex items-center justify-between px-4 md:px-6 gap-4">
      <button onClick={onMenuClick} className="md:hidden p-2 text-gray-500 hover:text-gray-700">
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex-1" />
      <div className="flex items-center gap-4">
        <NotificationBell />
        <UserMenu
          firstName={firstName}
          lastName={lastName}
          role={role}
          onLogout={onLogout}
        />
      </div>
    </header>
  );
}
