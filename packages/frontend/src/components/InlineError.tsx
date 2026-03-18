import { AlertCircle, RefreshCw } from 'lucide-react';

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
}

export function InlineError({ message, onRetry }: InlineErrorProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-red-600">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="ml-1 text-red-700 hover:text-red-900">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
