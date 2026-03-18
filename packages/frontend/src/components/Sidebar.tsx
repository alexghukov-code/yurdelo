import { NavLink, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Briefcase, Users, Calendar, BarChart3, Scale, UserCog, X } from 'lucide-react';
import { can, type Permission } from '../lib/permissions';

const NAV: Array<{ to: string; label: string; icon: React.ElementType; allow: Permission }> = [
  { to: '/cases', label: 'Дела', icon: Briefcase, allow: 'nav:cases' },
  { to: '/parties', label: 'Контрагенты', icon: Users, allow: 'nav:parties' },
  { to: '/calendar', label: 'Календарь', icon: Calendar, allow: 'nav:calendar' },
  { to: '/reports', label: 'Отчёты', icon: BarChart3, allow: 'nav:reports' },
  { to: '/users', label: 'Пользователи', icon: UserCog, allow: 'nav:users' },
];

interface SidebarProps {
  role: string;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ role, open, onClose }: SidebarProps) {
  const location = useLocation();

  // Close drawer on navigation
  useEffect(() => {
    onClose();
  }, [location.pathname]); // eslint-disable-line

  const nav = (
    <>
      <div className="px-4 py-5 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-6 w-6 text-blue-600" />
          <span className="text-lg font-bold text-gray-900">ЮрДело</span>
        </div>
        <button onClick={onClose} className="md:hidden p-1 text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV.filter((n) => can(role, n.allow)).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop: static sidebar */}
      <aside className="hidden md:flex w-56 bg-white border-r flex-col">{nav}</aside>

      {/* Mobile: drawer overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="fixed inset-0 bg-black/40" onClick={onClose} />
          <aside className="relative z-50 w-64 h-full bg-white flex flex-col shadow-xl">
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
