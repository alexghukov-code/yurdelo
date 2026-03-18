import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { PermissionGate } from '../components/PermissionGate';
import { useCasesList } from '../hooks/useCases';
import { useDebounce } from '../hooks/useDebounce';
import { PageSkeleton } from '../components/PageSkeleton';
import { EmptyState } from '../components/EmptyState';
import { QueryErrorView } from '../components/QueryErrorView';

export function CasesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isError, error, refetch } = useCasesList({
    page,
    status: status || undefined,
    search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Дела</h1>
        <PermissionGate roles={['admin', 'lawyer']}>
          <Link
            to="/cases/new"
            className="flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Дело
          </Link>
        </PermissionGate>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск дел..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все статусы</option>
          <option value="active">Активные</option>
          <option value="closed">Закрытые</option>
          <option value="suspended">Приостановленные</option>
        </select>
      </div>

      {/* Content */}
      {isLoading && <PageSkeleton variant="table" />}

      {isError && <QueryErrorView error={error} onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState
          title="Дел пока нет"
          description={
            debouncedSearch
              ? `Ничего не найдено по запросу "${debouncedSearch}". Попробуйте изменить фильтры.`
              : 'Нажмите + Дело, чтобы добавить первое.'
          }
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-500">Название</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Истец</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Ответчик</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Категория</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/cases/${c.id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.pltName}</td>
                    <td className="px-4 py-3 text-gray-500">{c.defName}</td>
                    <td className="px-4 py-3 text-gray-500">{c.category}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Показано {data.data.length} из {data.meta.total}
              </p>
              <div className="flex gap-1">
                {Array.from({ length: data.meta.totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    className={`px-3 py-1 rounded text-sm ${
                      page === i + 1
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
    suspended: 'bg-yellow-100 text-yellow-800',
  };
  const labels: Record<string, string> = {
    active: 'Активно',
    closed: 'Закрыто',
    suspended: 'Приостановлено',
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? ''}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
