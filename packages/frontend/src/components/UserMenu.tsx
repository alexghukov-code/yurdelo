import { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Руководитель',
  lawyer: 'Адвокат',
  viewer: 'Наблюдатель',
};

interface UserMenuProps {
  firstName: string;
  lastName: string;
  role: string;
  onLogout: () => void;
}

export function UserMenu({ firstName, lastName, role, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
      >
        <span className="font-medium">{lastName} {firstName}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-50">
          <div className="px-4 py-3 border-b">
            <p className="text-sm font-medium text-gray-900 truncate">
              {lastName} {firstName}
            </p>
            <p className="text-xs text-gray-500">{ROLE_LABELS[role] ?? role}</p>
          </div>
          <button
            onClick={() => { onLogout(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}
