import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { NotificationBell } from './NotificationBell';
import {
  Briefcase, Users, Calendar, BarChart3, LogOut, Scale,
} from 'lucide-react';

const NAV = [
  { to: '/', label: 'Дела', icon: Briefcase, roles: ['admin', 'lawyer', 'viewer'] },
  { to: '/parties', label: 'Контрагенты', icon: Users, roles: ['admin', 'lawyer', 'viewer'] },
  { to: '/calendar', label: 'Календарь', icon: Calendar, roles: ['admin', 'lawyer', 'viewer'] },
  { to: '/reports', label: 'Отчёты', icon: BarChart3, roles: ['admin', 'lawyer'] },
];

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r flex flex-col">
        <div className="px-4 py-5 border-b">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-blue-600" />
            <span className="text-lg font-bold text-gray-900">ЮрДело</span>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
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

        <div className="px-4 py-3 border-t">
          <p className="text-sm font-medium text-gray-900 truncate">
            {user.lastName} {user.firstName}
          </p>
          <p className="text-xs text-gray-500">{user.role}</p>
          <button
            onClick={() => logout()}
            className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600"
          >
            <LogOut className="h-3.5 w-3.5" />
            Выйти
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b flex items-center justify-end px-6 gap-4">
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
