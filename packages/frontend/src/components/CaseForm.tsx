import { useForm, Controller } from 'react-hook-form';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { PartySelect } from './PartySelect';
import type { Case } from '../api/cases';

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'civil', label: 'Гражданское' },
  { value: 'arbitration', label: 'Арбитраж' },
  { value: 'admin', label: 'Административное' },
  { value: 'criminal', label: 'Уголовное' },
  { value: 'labor', label: 'Трудовое' },
];

export interface CaseFormValues {
  name: string;
  category: string;
  pltId: string;
  defId: string;
  claimAmount: string;
}

interface CaseFormProps {
  mode: 'create' | 'edit';
  initialData?: Case;
  onSubmit: (values: CaseFormValues & { updatedAt?: string }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function CaseForm({ mode, initialData, onSubmit, onCancel, isSubmitting }: CaseFormProps) {
  const { user } = useAuth();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<CaseFormValues>({
    defaultValues: {
      name: initialData?.name ?? '',
      category: initialData?.category ?? '',
      pltId: initialData?.pltId ?? '',
      defId: initialData?.defId ?? '',
      claimAmount: initialData?.claimAmount != null ? String(initialData.claimAmount) : '',
    },
  });

  const pltId = watch('pltId');
  const defId = watch('defId');
  const sameParty = pltId !== '' && defId !== '' && pltId === defId;

  function handleFormSubmit(values: CaseFormValues) {
    onSubmit({
      ...values,
      ...(mode === 'edit' && initialData ? { updatedAt: initialData.updatedAt } : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Name */}
      <div>
        <label htmlFor="cf-name" className="block text-sm font-medium text-gray-700 mb-1">
          Название дела
        </label>
        <input
          id="cf-name"
          {...register('name', {
            required: 'Название обязательно.',
            minLength: { value: 3, message: 'Минимум 3 символа.' },
          })}
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.name ? 'border-red-300' : 'border-gray-300'
          }`}
        />
        {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
      </div>

      {/* Category */}
      <div>
        <label htmlFor="cf-category" className="block text-sm font-medium text-gray-700 mb-1">
          Категория
        </label>
        <select
          id="cf-category"
          {...register('category', { required: 'Категория обязательна.' })}
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.category ? 'border-red-300' : 'border-gray-300'
          }`}
        >
          <option value="">— Выберите —</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category.message}</p>}
      </div>

      {/* Plaintiff */}
      <Controller
        name="pltId"
        control={control}
        rules={{ required: 'Истец обязателен.' }}
        render={({ field }) => (
          <PartySelect
            label="Истец"
            value={field.value}
            onChange={field.onChange}
            error={errors.pltId?.message}
          />
        )}
      />

      {/* Defendant */}
      <Controller
        name="defId"
        control={control}
        rules={{ required: 'Ответчик обязателен.' }}
        render={({ field }) => (
          <PartySelect
            label="Ответчик"
            value={field.value}
            onChange={field.onChange}
            error={errors.defId?.message}
          />
        )}
      />

      {/* Same party warning */}
      {sameParty && (
        <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Истец и ответчик совпадают.
        </div>
      )}

      {/* Claim amount */}
      <div>
        <label htmlFor="cf-amount" className="block text-sm font-medium text-gray-700 mb-1">
          Цена иска, ₽
        </label>
        <input
          id="cf-amount"
          type="number"
          min="0"
          step="0.01"
          {...register('claimAmount', {
            validate: (v) => v === '' || Number(v) >= 0 || 'Сумма не может быть отрицательной.',
          })}
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.claimAmount ? 'border-red-300' : 'border-gray-300'
          }`}
        />
        {errors.claimAmount && (
          <p className="text-xs text-red-600 mt-1">{errors.claimAmount.message}</p>
        )}
      </div>

      {/* Admin sees lawyer info */}
      {user?.role === 'admin' && mode === 'edit' && initialData?.lawyerName && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ответственный</label>
          <p className="text-sm text-gray-600">{initialData.lawyerName}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Сохранение...' : mode === 'create' ? 'Создать' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}
