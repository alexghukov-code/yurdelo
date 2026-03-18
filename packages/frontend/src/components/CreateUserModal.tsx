import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { createUser } from '../api/users';
import toast from 'react-hot-toast';

interface Props {
  onClose: () => void;
}

interface FormValues {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName: string;
  role: string;
  phone: string;
}

export function CreateUserModal({ onClose }: Props) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { role: 'lawyer' },
  });

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Пользователь создан');
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Новый пользователь</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
          <div>
            <label htmlFor="cu-last" className="block text-sm font-medium text-gray-700 mb-1">Фамилия</label>
            <input id="cu-last" {...register('lastName', { required: 'Обязательно.', minLength: { value: 2, message: 'Минимум 2 символа.' } })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.lastName ? 'border-red-300' : 'border-gray-300'}`} />
            {errors.lastName && <p className="text-xs text-red-600 mt-1">{errors.lastName.message}</p>}
          </div>
          <div>
            <label htmlFor="cu-first" className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
            <input id="cu-first" {...register('firstName', { required: 'Обязательно.', minLength: { value: 2, message: 'Минимум 2 символа.' } })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.firstName ? 'border-red-300' : 'border-gray-300'}`} />
            {errors.firstName && <p className="text-xs text-red-600 mt-1">{errors.firstName.message}</p>}
          </div>
          <div>
            <label htmlFor="cu-mid" className="block text-sm font-medium text-gray-700 mb-1">Отчество</label>
            <input id="cu-mid" {...register('middleName')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="cu-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input id="cu-email" type="email" {...register('email', { required: 'Обязательно.' })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.email ? 'border-red-300' : 'border-gray-300'}`} />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="cu-pass" className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
            <input id="cu-pass" type="password" {...register('password', {
              required: 'Обязательно.',
              minLength: { value: 8, message: 'Минимум 8 символов.' },
              pattern: { value: /(?=.*[a-zA-Zа-яА-Я])(?=.*\d)/, message: 'Буква + цифра обязательны.' },
            })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.password ? 'border-red-300' : 'border-gray-300'}`} />
            {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <label htmlFor="cu-role" className="block text-sm font-medium text-gray-700 mb-1">Роль</label>
            <select id="cu-role" {...register('role')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="admin">Руководитель</option>
              <option value="lawyer">Адвокат</option>
              <option value="viewer">Наблюдатель</option>
            </select>
          </div>
          <div>
            <label htmlFor="cu-phone" className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
            <input id="cu-phone" {...register('phone')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <button type="submit" disabled={mutation.isPending}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {mutation.isPending ? 'Создание...' : 'Создать'}
          </button>
        </form>
      </div>
    </div>
  );
}
