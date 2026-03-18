import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications, useMarkRead, useMarkAllRead } from '../hooks/useNotifications';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, isError } = useNotifications(10);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();

  const unread = data?.meta?.unreadCount ?? 0;
  const items = data?.data ?? [];

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
        className="relative p-2 text-gray-500 hover:text-gray-700"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">Уведомления</span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Прочитать все
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {isError ? (
              <p className="px-4 py-8 text-sm text-red-500 text-center">
                Не удалось загрузить уведомления.
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-sm text-gray-400 text-center">
                Новых уведомлений нет.
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.isRead) markRead.mutate(n.id);
                    if (n.link) navigate(n.link);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0 ${
                    n.isRead ? 'opacity-60' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                  {n.message && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{n.message}</p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">
                    {format(new Date(n.createdAt), 'd MMM HH:mm', { locale: ru })}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
