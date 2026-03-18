import { RefreshCw } from 'lucide-react';

interface Props {
  open: boolean;
  onRefresh: () => void;
}

export function StaleDataModal({ open, onRefresh }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900">Данные устарели</h3>
        <p className="mt-2 text-sm text-gray-600">
          Данные были изменены другим пользователем. Обновите страницу, чтобы получить актуальную
          версию.
        </p>
        <button
          onClick={onRefresh}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
        >
          <RefreshCw className="h-4 w-4" />
          Обновить
        </button>
      </div>
    </div>
  );
}
