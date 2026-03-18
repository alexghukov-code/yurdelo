import { getHttpStatus } from '../api/client';
import { ErrorAlert } from './ErrorAlert';
import { AccessDenied } from './ProtectedRoute';

interface QueryErrorViewProps {
  error: unknown;
  onRetry?: () => void;
}

const STATUS_MESSAGES: Record<number, string> = {
  403: 'Нет доступа. Обратитесь к руководителю.',
  404: 'Запрашиваемый ресурс не найден.',
};

export function QueryErrorView({ error, onRetry }: QueryErrorViewProps) {
  const status = getHttpStatus(error);

  if (status === 403) return <AccessDenied />;

  const message = STATUS_MESSAGES[status ?? 0] ?? 'Не удалось загрузить данные.';
  const showRetry = status !== 404;

  return <ErrorAlert message={message} onRetry={showRetry ? onRetry : undefined} />;
}
