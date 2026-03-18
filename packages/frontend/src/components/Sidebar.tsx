import { NavLink } from 'react-router-dom';
import {
  Briefcase, Users, Calendar, BarChart3, Scale,
} from 'lucide-react';
import { can, type Permission } from '../lib/permissions';

const NAV: Array<{ to: string; label: string; icon: React.ElementType; allow: Permission }> = [
  { to: '/', label: 'Дела', icon: Briefcase, allow: 'nav:cases' },
  { to: '/parties', label: 'Контрагенты', icon: Users, allow: 'nav:parties' },
  { to: '/calendar', label: 'Календарь', icon: Calendar, allow: 'nav:calendar' },
  { to: '/reports', label: 'Отчёты', icon: BarChart3, allow: 'nav:reports' },
];

interface SidebarProps {
  role: string;
}

export function Sidebar({ role }: SidebarProps) {
  return (
    <aside className="w-56 bg-white border-r flex flex-col">
      <div className="px-4 py-5 border-b">
        <div className="flex items-center gap-2">
          <Scale className="h-6 w-6 text-blue-600" />
          <span className="text-lg font-bold text-gray-900">ЮрДело</span>
        </div>
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
    </aside>
  );
}
