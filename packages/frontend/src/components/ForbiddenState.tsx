import { ShieldX } from 'lucide-react';

interface ForbiddenStateProps {
  message?: string;
}

export function ForbiddenState({
  message = 'Обратитесь к руководителю.',
}: ForbiddenStateProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <ShieldX className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900">Нет доступа</h1>
        <p className="mt-2 text-gray-500">{message}</p>
      </div>
    </div>
  );
}
