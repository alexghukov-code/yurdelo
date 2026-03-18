import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { restoreUser } from '../api/users';
import toast from 'react-hot-toast';

interface Props {
  userId: string;
  userName: string;
  previousRole: string;
  onClose: () => void;
}

interface FormValues {
  date: string;
  role: string;
  comment: string;
}

export function RestoreUserModal({ userId, userName, previousRole, onClose }: Props) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      role: previousRole,
    },
  });

  const mutation = useMutation({
    mutationFn: (body: FormValues) =>
      restoreUser(userId, {
        date: body.date,
        role: body.role,
        comment: body.comment || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Пользователь восстановлен');
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Восстановить пользователя</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Восстановление <span className="font-medium">{userName}</span>.
        </p>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
          <div>
            <label htmlFor="ru-date" className="block text-sm font-medium text-gray-700 mb-1">
              Дата
            </label>
            <input
              id="ru-date"
              type="date"
              {...register('date', { required: 'Обязательно.' })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.date ? 'border-red-300' : 'border-gray-300'}`}
            />
            {errors.date && <p className="text-xs text-red-600 mt-1">{errors.date.message}</p>}
          </div>
          <div>
            <label htmlFor="ru-role" className="block text-sm font-medium text-gray-700 mb-1">
              Роль
            </label>
            <select
              id="ru-role"
              {...register('role')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="admin">Руководитель</option>
              <option value="lawyer">Адвокат</option>
              <option value="viewer">Наблюдатель</option>
            </select>
          </div>
          <div>
            <label htmlFor="ru-comment" className="block text-sm font-medium text-gray-700 mb-1">
              Комментарий
            </label>
            <textarea
              id="ru-comment"
              rows={2}
              {...register('comment')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Восстановление...' : 'Восстановить'}
          </button>
        </form>
      </div>
    </div>
  );
}
