import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, AlertTriangle } from 'lucide-react';
import { createStage, updateStage, STAGE_TYPES } from '../api/stages';
import { isStaleDataError } from '../api/client';
import toast from 'react-hot-toast';
import type { Stage } from '../api/cases';

interface Props {
  mode: 'create' | 'edit';
  caseId: string;
  existingStages: Stage[];
  initialData?: Stage;
  onClose: () => void;
  onStale: () => void;
}

interface FormValues {
  stageTypeId: string;
  court: string;
  caseNumber: string;
}

export function StageFormModal({ mode, caseId, existingStages, initialData, onClose, onStale }: Props) {
  const qc = useQueryClient();

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      stageTypeId: initialData?.stageTypeId ?? '',
      court: initialData?.court ?? '',
      caseNumber: initialData?.caseNumber ?? '',
    },
  });

  const selectedTypeId = watch('stageTypeId');
  const selectedType = STAGE_TYPES.find((t) => t.id === selectedTypeId);
  const maxExistingOrder = existingStages.length
    ? Math.max(...existingStages.map((s) => s.sortOrder))
    : 0;
  const showWarning = mode === 'create' && selectedType && selectedType.sortOrder <= maxExistingOrder;

  const createMutation = useMutation({
    mutationFn: (body: { stageTypeId: string; sortOrder: number; court: string; caseNumber: string }) =>
      createStage(caseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases', caseId] });
      toast.success('Стадия добавлена');
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown> & { updatedAt: string }) =>
      updateStage(initialData!.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases', caseId] });
      toast.success('Стадия обновлена');
      onClose();
    },
    onError: (err) => {
      if (isStaleDataError(err)) onStale();
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: FormValues) {
    if (mode === 'create') {
      const type = STAGE_TYPES.find((t) => t.id === values.stageTypeId);
      createMutation.mutate({
        stageTypeId: values.stageTypeId,
        sortOrder: type?.sortOrder ?? 1,
        court: values.court,
        caseNumber: values.caseNumber,
      });
    } else {
      updateMutation.mutate({
        court: values.court,
        caseNumber: values.caseNumber,
        updatedAt: initialData!.updatedAt,
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {mode === 'create' ? 'Новая стадия' : 'Редактирование стадии'}
          </h3>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {/* Stage type — only for create */}
          {mode === 'create' && (
            <div>
              <label htmlFor="sf-type" className="block text-sm font-medium text-gray-700 mb-1">Тип стадии</label>
              <select
                id="sf-type"
                {...register('stageTypeId', { required: 'Выберите тип стадии.' })}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.stageTypeId ? 'border-red-300' : 'border-gray-300'}`}
              >
                <option value="">— Выберите —</option>
                {STAGE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {errors.stageTypeId && <p className="text-xs text-red-600 mt-1">{errors.stageTypeId.message}</p>}
            </div>
          )}

          {/* Sort order warning */}
          {showWarning && (
            <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Вы добавляете «{selectedType!.name}» (порядок {selectedType!.sortOrder}) раньше существующей стадии с порядком {maxExistingOrder}. Продолжить?
            </div>
          )}

          <div>
            <label htmlFor="sf-court" className="block text-sm font-medium text-gray-700 mb-1">Суд</label>
            <input
              id="sf-court"
              {...register('court', { required: 'Обязательно.', minLength: { value: 3, message: 'Минимум 3 символа.' } })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.court ? 'border-red-300' : 'border-gray-300'}`}
            />
            {errors.court && <p className="text-xs text-red-600 mt-1">{errors.court.message}</p>}
          </div>

          <div>
            <label htmlFor="sf-number" className="block text-sm font-medium text-gray-700 mb-1">Номер дела</label>
            <input
              id="sf-number"
              {...register('caseNumber', { required: 'Обязательно.', minLength: { value: 5, message: 'Минимум 5 символов.' } })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.caseNumber ? 'border-red-300' : 'border-gray-300'}`}
            />
            {errors.caseNumber && <p className="text-xs text-red-600 mt-1">{errors.caseNumber.message}</p>}
          </div>

          <button type="submit" disabled={isPending}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {isPending ? 'Сохранение...' : mode === 'create' ? 'Добавить' : 'Сохранить'}
          </button>
        </form>
      </div>
    </div>
  );
}
