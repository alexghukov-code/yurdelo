import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { fetchCases } from '../api/cases';
import { fetchMyReport } from '../api/reports';
import { PageSkeleton } from '../components/PageSkeleton';
import { Briefcase, TrendingUp, AlertTriangle } from 'lucide-react';

export function DashboardPage() {
  const { user } = useAuth();

  const { data: casesData, isLoading: casesLoading } = useQuery({
    queryKey: ['dashboard', 'recent-cases'],
    queryFn: () => fetchCases({ page: 1, limit: 5 }),
    staleTime: 60_000, // dashboard doesn't need to refetch on every focus
  });

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['reports', 'my'],
    queryFn: fetchMyReport,
    enabled: user?.role !== 'viewer',
  });

  if (casesLoading || reportLoading) return <PageSkeleton />;

  const load = report?.load;
  const results = report?.results;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Добро пожаловать, {user?.firstName}
      </h1>

      {load && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard icon={Briefcase} label="Активные дела" value={load.activeCases} color="blue" />
          <StatCard
            icon={TrendingUp}
            label="Win Rate"
            value={results?.winRate !== null ? `${results?.winRate}%` : '—'}
            color="green"
          />
          <StatCard
            icon={AlertTriangle}
            label="Закрытые дела"
            value={load.closedCases}
            color="gray"
          />
        </div>
      )}

      <h2 className="text-lg font-semibold text-gray-900 mb-3">Последние дела</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500">Название</th>
              <th className="px-4 py-3 font-medium text-gray-500">Категория</th>
              <th className="px-4 py-3 font-medium text-gray-500">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {casesData?.data.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.category}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    gray: 'bg-gray-50 text-gray-600',
  };
  return (
    <div className="bg-white rounded-lg shadow p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${colors[color]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
    suspended: 'bg-yellow-100 text-yellow-800',
  };
  const labels: Record<string, string> = {
    active: 'Активно',
    closed: 'Закрыто',
    suspended: 'Приостановлено',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? map.active}`}>
      {labels[status] ?? status}
    </span>
  );
}
