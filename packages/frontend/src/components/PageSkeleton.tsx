import { Skeleton } from './Skeleton';

interface PageSkeletonProps {
  variant?: 'card' | 'table';
}

export function PageSkeleton({ variant = 'card' }: PageSkeletonProps) {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      {variant === 'table' ? <TableBlock /> : <CardBlock />}
    </div>
  );
}

function CardBlock() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-lg shadow p-6 space-y-4">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function TableBlock() {
  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}
