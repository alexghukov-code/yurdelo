import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchCalendar, type CalendarEvent } from '../api/reports';
import { CardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';

export function CalendarPage() {
  const [current, setCurrent] = useState(new Date());
  const year = current.getFullYear();
  const month = current.getMonth() + 1;

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => fetchCalendar(year, month),
  });

  const start = startOfMonth(current);
  const end = endOfMonth(current);
  const days = eachDayOfInterval({ start, end });
  const startPad = (getDay(start) + 6) % 7; // Monday=0

  function eventsOnDay(day: Date): CalendarEvent[] {
    return events.filter((e) => isSameDay(new Date(e.datetime), day));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Календарь</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrent(new Date(year, month - 2, 1))} className="p-1.5 hover:bg-gray-100 rounded">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium w-36 text-center">
            {format(current, 'LLLL yyyy', { locale: ru })}
          </span>
          <button onClick={() => setCurrent(new Date(year, month, 1))} className="p-1.5 hover:bg-gray-100 rounded">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {isLoading && <CardSkeleton />}

      {!isLoading && events.length === 0 && (
        <EmptyState title="Нет событий" description="В этом месяце заседаний не запланировано." />
      )}

      {!isLoading && events.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          {/* Day headers */}
          <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 border-b py-2">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="h-24 border-b border-r" />
            ))}
            {days.map((day) => {
              const dayEvents = eventsOnDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={`h-24 border-b border-r p-1 ${isToday ? 'bg-blue-50' : ''}`}
                >
                  <span className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                    {format(day, 'd')}
                  </span>
                  <div className="mt-0.5 space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((e) => (
                      <Link
                        key={e.id}
                        to={`/cases/${e.caseId}`}
                        className="block text-[10px] leading-tight px-1 py-0.5 rounded bg-blue-100 text-blue-800 truncate hover:bg-blue-200"
                      >
                        {format(new Date(e.datetime), 'HH:mm')} {e.caseName}
                      </Link>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="text-[10px] text-gray-400 px-1">
                        +{dayEvents.length - 2}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
