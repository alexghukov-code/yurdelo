import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ConflictStateProps {
  onRefresh: () => void;
  message?: string;
}

export function ConflictState({
  onRefresh,
  message = 'Данные были изменены другим пользователем.',
}: ConflictStateProps) {
  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-yellow-800">Данные устарели</p>
        <p className="text-sm text-yellow-700 mt-0.5">{message}</p>
        <button
          onClick={onRefresh}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-yellow-700 hover:text-yellow-900"
        >
          <RefreshCw className="h-4 w-4" />
          Обновить
        </button>
      </div>
    </div>
  );
}
