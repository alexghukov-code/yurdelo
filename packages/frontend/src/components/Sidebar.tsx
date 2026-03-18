import { NavLink } from 'react-router-dom';
import {
  Briefcase, Users, Calendar, BarChart3, Scale,
} from 'lucide-react';

const NAV = [
  { to: '/', label: 'Дела', icon: Briefcase, roles: ['admin', 'lawyer', 'viewer'] },
  { to: '/parties', label: 'Контрагенты', icon: Users, roles: ['admin', 'lawyer', 'viewer'] },
  { to: '/calendar', label: 'Календарь', icon: Calendar, roles: ['admin', 'lawyer', 'viewer'] },
  { to: '/reports', label: 'Отчёты', icon: BarChart3, roles: ['admin', 'lawyer'] },
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
        {NAV.filter((n) => n.roles.includes(role)).map((n) => (
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
