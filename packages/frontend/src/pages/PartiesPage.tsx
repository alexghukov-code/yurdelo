import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Search, Plus, X, Pencil, Trash2 } from 'lucide-react';
import { fetchParties, createParty, updateParty, deleteParty, type Party } from '../api/parties';
import { PermissionGate } from '../components/PermissionGate';
import { usePermission } from '../hooks/usePermission';
import { useDebounce } from '../hooks/useDebounce';
import { PageSkeleton } from '../components/PageSkeleton';
import { QueryErrorView } from '../components/QueryErrorView';
import { EmptyState } from '../components/EmptyState';
import toast from 'react-hot-toast';

export function PartiesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editParty, setEditParty] = useState<Party | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const canEdit = usePermission('party:edit');
  const canDelete = usePermission('party:delete');
  const showActions = canEdit || canDelete;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['parties', { search: debouncedSearch }],
    queryFn: () => fetchParties({ search: debouncedSearch || undefined }),
    placeholderData: (prev) => prev,
  });

  const deleteMut = useMutation({
    mutationFn: deleteParty,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parties'] });
      toast.success('Контрагент удалён');
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Контрагенты</h1>
        <PermissionGate allow="party:create">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Контрагент
          </button>
        </PermissionGate>
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

      {isLoading && <PageSkeleton variant="table" />}

      {isError && <QueryErrorView error={error} onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState
          title="Контрагентов нет"
          description={
            debouncedSearch ? `Ничего не найдено по запросу "${debouncedSearch}".` : undefined
          }
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
                {showActions && <th className="px-4 py-3 font-medium text-gray-500 w-20" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.data.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-500">{p.inn ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.email ?? '—'}</td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <button
                            onClick={() => setEditParty(p)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => {
                              if (confirm(`Удалить контрагента «${p.name}»?`))
                                deleteMut.mutate(p.id);
                            }}
                            className="p-1 text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <PartyModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['parties'] });
          }}
        />
      )}

      {editParty && (
        <PartyModal
          mode="edit"
          party={editParty}
          onClose={() => setEditParty(null)}
          onSuccess={() => {
            setEditParty(null);
            qc.invalidateQueries({ queryKey: ['parties'] });
          }}
        />
      )}
    </div>
  );
}

/* ── Unified create/edit modal ── */

interface PartyModalProps {
  mode: 'create' | 'edit';
  party?: Party;
  onClose: () => void;
  onSuccess: () => void;
}

interface PartyFormValues {
  name: string;
  inn: string;
  ogrn: string;
  address: string;
  phone: string;
  email: string;
}

function PartyModal({ mode, party, onClose, onSuccess }: PartyModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PartyFormValues>({
    defaultValues: {
      name: party?.name ?? '',
      inn: party?.inn ?? '',
      ogrn: party?.ogrn ?? '',
      address: party?.address ?? '',
      phone: party?.phone ?? '',
      email: party?.email ?? '',
    },
  });

  const createMut = useMutation({
    mutationFn: createParty,
    onSuccess: () => {
      toast.success('Контрагент создан');
      onSuccess();
    },
  });

  const updateMut = useMutation({
    mutationFn: (body: PartyFormValues) =>
      updateParty(party!.id, { ...body, updatedAt: party!.updatedAt }),
    onSuccess: () => {
      toast.success('Контрагент обновлён');
      onSuccess();
    },
  });

  const isPending = createMut.isPending || updateMut.isPending;

  function onSubmit(values: PartyFormValues) {
    // Strip empty strings to undefined — backend Zod rejects "" for optional email
    const clean: Record<string, unknown> = { name: values.name };
    if (values.inn) clean.inn = values.inn;
    if (values.ogrn) clean.ogrn = values.ogrn;
    if (values.address) clean.address = values.address;
    if (values.phone) clean.phone = values.phone;
    if (values.email) clean.email = values.email;

    if (mode === 'create') {
      createMut.mutate(clean);
    } else {
      updateMut.mutate(values);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {mode === 'create' ? 'Новый контрагент' : 'Редактирование контрагента'}
          </h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label htmlFor="pm-name" className="block text-sm font-medium text-gray-700 mb-1">
              Название
            </label>
            <input
              id="pm-name"
              {...register('name', {
                required: 'Обязательно.',
                minLength: { value: 2, message: 'Минимум 2 символа.' },
              })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.name ? 'border-red-300' : 'border-gray-300'}`}
            />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="pm-inn" className="block text-sm font-medium text-gray-700 mb-1">
              ИНН
            </label>
            <input
              id="pm-inn"
              maxLength={12}
              {...register('inn')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="pm-ogrn" className="block text-sm font-medium text-gray-700 mb-1">
              ОГРН
            </label>
            <input
              id="pm-ogrn"
              maxLength={15}
              {...register('ogrn')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="pm-addr" className="block text-sm font-medium text-gray-700 mb-1">
              Адрес
            </label>
            <input
              id="pm-addr"
              {...register('address')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="pm-phone" className="block text-sm font-medium text-gray-700 mb-1">
              Телефон
            </label>
            <input
              id="pm-phone"
              {...register('phone')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="pm-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="pm-email"
              type="email"
              {...register('email')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Сохранение...' : mode === 'create' ? 'Создать' : 'Сохранить'}
          </button>
        </form>
      </div>
    </div>
  );
}
