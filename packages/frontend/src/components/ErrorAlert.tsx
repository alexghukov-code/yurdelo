import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  message: string;
  onRetry?: () => void;
}

export function ErrorAlert({ message, onRetry }: Props) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-red-800">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-900"
          >
            <RefreshCw className="h-4 w-4" />
            Повторить
          </button>
        )}
      </div>
    </div>
  );
}
