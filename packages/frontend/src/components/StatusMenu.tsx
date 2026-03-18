import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface StatusMenuProps {
  currentStatus: string;
  onChangeStatus: (newStatus: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Активно',
  closed: 'Закрыто',
  suspended: 'Приостановлено',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
  suspended: 'bg-yellow-100 text-yellow-800',
};

interface Action {
  label: string;
  status: string;
  confirm: string;
}

const ACTIONS_BY_STATUS: Record<string, Action[]> = {
  active: [
    { label: 'Закрыть дело', status: 'closed', confirm: 'Закрыть дело? Это действие можно отменить.' },
    { label: 'Приостановить', status: 'suspended', confirm: 'Приостановить дело?' },
  ],
  closed: [
    { label: 'Возобновить', status: 'active', confirm: 'Возобновить дело?' },
  ],
  suspended: [
    { label: 'Возобновить', status: 'active', confirm: 'Возобновить дело?' },
  ],
};

export function StatusMenu({ currentStatus, onChangeStatus }: StatusMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const actions = ACTIONS_BY_STATUS[currentStatus] ?? [];
  if (actions.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
      >
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[currentStatus] ?? ''}`}>
          {STATUS_LABELS[currentStatus] ?? currentStatus}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border z-50">
          {actions.map((a) => (
            <button
              key={a.status}
              onClick={() => {
                setOpen(false);
                if (confirm(a.confirm)) onChangeStatus(a.status);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
