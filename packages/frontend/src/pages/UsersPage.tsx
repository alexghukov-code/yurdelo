import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchUsers } from '../api/users';
import { useAuth } from '../hooks/useAuth';
import { PermissionGate } from '../components/PermissionGate';
import { PageSkeleton } from '../components/PageSkeleton';
import { QueryErrorView } from '../components/QueryErrorView';
import { EmptyState } from '../components/EmptyState';
import { CreateUserModal } from '../components/CreateUserModal';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Руководитель',
  lawyer: 'Адвокат',
  viewer: 'Наблюдатель',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  inactive: 'Неактивен',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
};

export function UsersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['users', { page, role: roleFilter || undefined, status: statusFilter || undefined }],
    queryFn: () => fetchUsers({
      page,
      role: roleFilter || undefined,
      status: statusFilter || undefined,
    }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Пользователи</h1>
        <PermissionGate allow="user:manage">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Пользователь
          </button>
        </PermissionGate>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все роли</option>
          <option value="admin">Руководитель</option>
          <option value="lawyer">Адвокат</option>
          <option value="viewer">Наблюдатель</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все статусы</option>
          <option value="active">Активен</option>
          <option value="inactive">Неактивен</option>
        </select>
      </div>

      {isLoading && <PageSkeleton variant="table" />}

      {isError && <QueryErrorView error={error} onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState title="Пользователей нет" description="Не найдено пользователей по выбранным фильтрам." />
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-500">ФИО</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Роль</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Статус</th>
                  {isAdmin && <th className="px-4 py-3 font-medium text-gray-500">Email</th>}
                  {isAdmin && <th className="px-4 py-3 font-medium text-gray-500">Телефон</th>}
                  {isAdmin && <th className="px-4 py-3 font-medium text-gray-500">Создан</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/users/${u.id}`} className="font-medium text-blue-600 hover:text-blue-800">
                        {u.lastName} {u.firstName}{u.middleName ? ` ${u.middleName}` : ''}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{ROLE_LABELS[u.role] ?? u.role}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[u.status] ?? ''}`}>
                        {STATUS_LABELS[u.status] ?? u.status}
                      </span>
                    </td>
                    {isAdmin && <td className="px-4 py-3 text-gray-500">{u.email ?? '—'}</td>}
                    {isAdmin && <td className="px-4 py-3 text-gray-500">{u.phone ?? '—'}</td>}
                    {isAdmin && (
                      <td className="px-4 py-3 text-gray-500">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('ru') : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
