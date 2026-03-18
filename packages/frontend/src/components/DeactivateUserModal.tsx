import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { deactivateUser, fetchActiveLawyers } from '../api/users';
import toast from 'react-hot-toast';

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
}

interface FormValues {
  date: string;
  reason: string;
  comment: string;
  transferToId: string;
}

export function DeactivateUserModal({ userId, userName, onClose }: Props) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { date: new Date().toISOString().slice(0, 10) },
  });

  const { data: lawyers = [] } = useQuery({
    queryKey: ['users', 'active-lawyers'],
    queryFn: fetchActiveLawyers,
  });

  const availableLawyers = lawyers.filter((l) => l.id !== userId);

  const mutation = useMutation({
    mutationFn: (body: FormValues) => deactivateUser(userId, {
      date: body.date,
      reason: body.reason,
      comment: body.comment || undefined,
      transferToId: body.transferToId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Пользователь деактивирован');
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Деактивировать пользователя</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Деактивация <span className="font-medium">{userName}</span>. Активные дела будут переданы выбранному адвокату.
        </p>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
          <div>
            <label htmlFor="du-date" className="block text-sm font-medium text-gray-700 mb-1">Дата</label>
            <input id="du-date" type="date" {...register('date', { required: 'Обязательно.' })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.date ? 'border-red-300' : 'border-gray-300'}`} />
            {errors.date && <p className="text-xs text-red-600 mt-1">{errors.date.message}</p>}
          </div>
          <div>
            <label htmlFor="du-reason" className="block text-sm font-medium text-gray-700 mb-1">Причина</label>
            <input id="du-reason" {...register('reason', { required: 'Причина обязательна.' })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.reason ? 'border-red-300' : 'border-gray-300'}`} />
            {errors.reason && <p className="text-xs text-red-600 mt-1">{errors.reason.message}</p>}
          </div>
          <div>
            <label htmlFor="du-transfer" className="block text-sm font-medium text-gray-700 mb-1">Передать дела</label>
            <select id="du-transfer" {...register('transferToId')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">— Нет активных дел —</option>
              {availableLawyers.map((l) => (
                <option key={l.id} value={l.id}>{l.lastName} {l.firstName}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="du-comment" className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
            <textarea id="du-comment" rows={2} {...register('comment')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <button type="submit" disabled={mutation.isPending}
            className="w-full bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {mutation.isPending ? 'Деактивация...' : 'Деактивировать'}
          </button>
        </form>
      </div>
    </div>
  );
}
