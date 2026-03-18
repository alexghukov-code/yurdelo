import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { createHearing, updateHearing } from '../api/hearings';
import { isStaleDataError } from '../api/client';
import toast from 'react-hot-toast';
import type { Hearing } from '../api/cases';

const TYPES = [
  { value: 'hearing', label: 'Заседание' },
  { value: 'adj', label: 'Перенос' },
  { value: 'result', label: 'Результат' },
  { value: 'note', label: 'Заметка' },
];

const RESULTS = [
  { value: 'win', label: 'Победа' },
  { value: 'lose', label: 'Проигрыш' },
  { value: 'part', label: 'Частично' },
  { value: 'world', label: 'Мировое' },
];

interface Props {
  mode: 'create' | 'edit';
  stageId: string;
  caseId: string;
  initialData?: Hearing;
  onClose: () => void;
  onStale: () => void;
  onResultCreated?: (result: string) => void;
}

interface FormValues {
  type: string;
  datetime: string;
  result: string;
  appealed: boolean;
  newDatetime: string;
  adjReason: string;
  notes: string;
}

export function HearingFormModal({ mode, stageId, caseId, initialData, onClose, onStale, onResultCreated }: Props) {
  const qc = useQueryClient();

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      type: initialData?.type ?? 'hearing',
      datetime: initialData?.datetime?.slice(0, 16) ?? '',
      result: initialData?.result ?? '',
      appealed: initialData?.appealed ?? false,
      newDatetime: initialData?.newDatetime?.slice(0, 16) ?? '',
      adjReason: initialData?.adjReason ?? '',
      notes: initialData?.notes ?? '',
    },
  });

  const selectedType = watch('type');

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => createHearing(stageId, body as any),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['cases', caseId] });
      toast.success('Слушание добавлено');
      onClose();
      if (vars.type === 'result' && vars.result && onResultCreated) {
        onResultCreated(vars.result as string);
      }
    },
  });

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown> & { updatedAt: string }) =>
      updateHearing(initialData!.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases', caseId] });
      toast.success('Слушание обновлено');
      onClose();
    },
    onError: (err) => {
      if (isStaleDataError(err)) onStale();
    },
  });

  const isPending = createMut.isPending || updateMut.isPending;

  function onSubmit(values: FormValues) {
    const body: Record<string, unknown> = {
      type: values.type,
      datetime: values.datetime,
      notes: values.notes || undefined,
    };

    if (values.type === 'result') {
      body.result = values.result;
      body.appealed = values.appealed;
    }
    if (values.type === 'adj') {
      body.newDatetime = values.newDatetime;
      body.adjReason = values.adjReason || undefined;
    }

    if (mode === 'create') {
      createMut.mutate(body);
    } else {
      updateMut.mutate({ ...body, updatedAt: initialData!.updatedAt });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {mode === 'create' ? 'Новое слушание' : 'Редактирование слушания'}
          </h3>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {/* Type */}
          <div>
            <label htmlFor="hf-type" className="block text-sm font-medium text-gray-700 mb-1">Тип</label>
            <select id="hf-type" {...register('type')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Datetime */}
          <div>
            <label htmlFor="hf-dt" className="block text-sm font-medium text-gray-700 mb-1">Дата и время</label>
            <input id="hf-dt" type="datetime-local"
              {...register('datetime', { required: 'Обязательно.' })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.datetime ? 'border-red-300' : 'border-gray-300'}`} />
            {errors.datetime && <p className="text-xs text-red-600 mt-1">{errors.datetime.message}</p>}
          </div>

          {/* Result fields */}
          {selectedType === 'result' && (
            <>
              <div>
                <label htmlFor="hf-result" className="block text-sm font-medium text-gray-700 mb-1">Результат</label>
                <select id="hf-result"
                  {...register('result', { required: selectedType === 'result' ? 'Результат обязателен.' : false })}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.result ? 'border-red-300' : 'border-gray-300'}`}>
                  <option value="">— Выберите —</option>
                  {RESULTS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                {errors.result && <p className="text-xs text-red-600 mt-1">{errors.result.message}</p>}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" {...register('appealed')} className="rounded" />
                Обжаловано
              </label>
            </>
          )}

          {/* Adj fields */}
          {selectedType === 'adj' && (
            <>
              <div>
                <label htmlFor="hf-newdt" className="block text-sm font-medium text-gray-700 mb-1">Новая дата</label>
                <input id="hf-newdt" type="datetime-local"
                  {...register('newDatetime', { required: selectedType === 'adj' ? 'Новая дата обязательна.' : false })}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.newDatetime ? 'border-red-300' : 'border-gray-300'}`} />
                {errors.newDatetime && <p className="text-xs text-red-600 mt-1">{errors.newDatetime.message}</p>}
              </div>
              <div>
                <label htmlFor="hf-reason" className="block text-sm font-medium text-gray-700 mb-1">Причина переноса</label>
                <input id="hf-reason" {...register('adjReason')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </>
          )}

          {/* Notes — always visible */}
          <div>
            <label htmlFor="hf-notes" className="block text-sm font-medium text-gray-700 mb-1">Заметки</label>
            <textarea id="hf-notes" rows={2} {...register('notes')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
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
