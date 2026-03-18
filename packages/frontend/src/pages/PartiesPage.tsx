import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Search, Plus, X } from 'lucide-react';
import { fetchParties, createParty, type Party } from '../api/parties';
import { useAuth } from '../hooks/useAuth';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { extractError } from '../api/client';
import toast from 'react-hot-toast';

export function PartiesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['parties', { search: debouncedSearch }],
    queryFn: () => fetchParties({ search: debouncedSearch || undefined }),
    placeholderData: (prev) => prev,
  });

  const canCreate = user?.role === 'admin' || user?.role === 'lawyer';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Контрагенты</h1>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Контрагент
          </button>
        )}
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Поиск контрагентов..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {isLoading && <TableSkeleton />}

      {data && data.data.length === 0 && (
        <EmptyState
          title="Контрагентов нет"
          description={debouncedSearch ? `Ничего не найдено по запросу "${debouncedSearch}".` : undefined}
        />
      )}

      {data && data.data.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Название</th>
                <th className="px-4 py-3 font-medium text-gray-500">ИНН</th>
                <th className="px-4 py-3 font-medium text-gray-500">Телефон</th>
                <th className="px-4 py-3 font-medium text-gray-500">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.data.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-500">{p.inn ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <CreatePartyModal
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['parties'] });
          }}
        />
      )}
    </div>
  );
}

function CreatePartyModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ name: string; inn?: string }>();
  const mutation = useMutation({
    mutationFn: createParty,
    onSuccess: () => { toast.success('Контрагент создан'); onSuccess(); },
    onError: (err) => toast.error(extractError(err).message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Новый контрагент</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
            <input {...register('name', { required: true, minLength: 2 })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ИНН</label>
            <input {...register('inn')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={isSubmitting}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {isSubmitting ? 'Создание...' : 'Создать'}
          </button>
        </form>
      </div>
    </div>
  );
}
