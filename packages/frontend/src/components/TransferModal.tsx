import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, AlertTriangle } from 'lucide-react';
import { createTransfer } from '../api/transfers';
import { fetchActiveLawyers } from '../api/users';
import toast from 'react-hot-toast';

interface Props {
  caseId: string;
  caseName: string;
  currentLawyerId: string;
  currentLawyerName: string;
  onClose: () => void;
}

interface FormValues {
  toId: string;
  comment: string;
}

export function TransferModal({
  caseId,
  caseName,
  currentLawyerId,
  currentLawyerName,
  onClose,
}: Props) {
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>();

  const { data: lawyers = [] } = useQuery({
    queryKey: ['users', 'active-lawyers'],
    queryFn: fetchActiveLawyers,
  });

  const available = lawyers.filter((l) => l.id !== currentLawyerId);
  const selectedId = watch('toId');
  const selectedName = available.find((l) => l.id === selectedId);

  const mutation = useMutation({
    mutationFn: (body: FormValues) =>
      createTransfer({
        caseId,
        toId: body.toId,
        comment: body.comment || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases', caseId] });
      qc.invalidateQueries({ queryKey: ['transfers', caseId] });
      toast.success('Дело передано');
      onClose();
    },
    onError: () => {
      setConfirmed(false);
    },
  });

  function onSubmit(values: FormValues) {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    mutation.mutate(values);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Передать дело</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label htmlFor="tf-to" className="block text-sm font-medium text-gray-700 mb-1">
              Кому
            </label>
            <select
              id="tf-to"
              {...register('toId', { required: 'Выберите получателя.' })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.toId ? 'border-red-300' : 'border-gray-300'}`}
            >
              <option value="">— Выберите адвоката —</option>
              {available.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lastName} {l.firstName}
                </option>
              ))}
            </select>
            {errors.toId && <p className="text-xs text-red-600 mt-1">{errors.toId.message}</p>}
          </div>

          <div>
            <label htmlFor="tf-comment" className="block text-sm font-medium text-gray-700 mb-1">
              Комментарий
            </label>
            <textarea
              id="tf-comment"
              rows={2}
              {...register('comment')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {confirmed && selectedName && (
            <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                Дело «{caseName}» будет передано от {currentLawyerName} к {selectedName.lastName}{' '}
                {selectedName.firstName}. Продолжить?
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Передача...' : confirmed ? 'Подтвердить передачу' : 'Передать'}
          </button>
        </form>
      </div>
    </div>
  );
}
