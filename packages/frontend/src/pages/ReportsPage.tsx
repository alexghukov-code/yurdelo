import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { fetchMyReport, fetchManagerReport, fetchCasesReport } from '../api/reports';
import { PageSkeleton } from '../components/PageSkeleton';
import { QueryErrorView } from '../components/QueryErrorView';
import { EmptyState } from '../components/EmptyState';

interface Tab {
  key: string;
  label: string;
  adminOnly: boolean;
}

const TABS: Tab[] = [
  { key: 'my', label: 'Мои показатели', adminOnly: false },
  { key: 'load', label: 'Нагрузка', adminOnly: true },
  { key: 'results', label: 'Результаты', adminOnly: true },
  { key: 'cases', label: 'Дела', adminOnly: true },
  { key: 'finance', label: 'Финансы', adminOnly: true },
];

export function ReportsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const [activeTab, setActiveTab] = useState('my');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const showPeriod = activeTab === 'cases';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Отчёты</h1>

      {/* Tab switcher — hidden for lawyer (single tab) */}
      {visibleTabs.length > 1 && (
        <div className="flex gap-1 mb-4 border-b">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Period selector — cases tab only */}
      {showPeriod && (
        <div className="flex gap-3 mb-4 items-center">
          <label className="text-sm text-gray-500">Период:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <span className="text-gray-400">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'my' && <MyReportTab />}
      {activeTab === 'load' && <ManagerTab tab="load" />}
      {activeTab === 'results' && <ManagerTab tab="results" />}
      {activeTab === 'cases' && <CasesTab dateFrom={dateFrom} dateTo={dateTo} />}
      {activeTab === 'finance' && <ManagerTab tab="finance" />}
    </div>
  );
}

/* ── My report tab ── */

function MyReportTab() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports', 'my'],
    queryFn: fetchMyReport,
  });

  if (isLoading) return <PageSkeleton />;
  if (isError) return <QueryErrorView error={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="Недостаточно данных" description="Нет данных для отчёта." />;

  const { load, results } = data;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Активные дела" value={load?.activeCases ?? 0} />
      <StatCard label="Закрытые дела" value={load?.closedCases ?? 0} />
      <StatCard label="Win Rate" value={results?.winRate != null ? `${results.winRate}%` : '—'} />
      <StatCard label="Всего результатов" value={results?.total ?? 0} />
    </div>
  );
}

/* ── Manager report tab ── */

function ManagerTab({ tab }: { tab: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports', 'manager', tab],
    queryFn: () => fetchManagerReport(tab),
  });

  if (isLoading) return <PageSkeleton variant="table" />;
  if (isError) return <QueryErrorView error={error} onRetry={refetch} />;
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return <EmptyState title="Недостаточно данных" description="Недостаточно данных для отчёта за выбранный период." />;
  }

  return <ReportTable data={Array.isArray(data) ? data : [data]} />;
}

/* ── Cases report tab ── */

function CasesTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports', 'cases', 'summary', dateFrom, dateTo],
    queryFn: () => fetchCasesReport('summary', dateFrom || undefined, dateTo || undefined),
  });

  if (isLoading) return <PageSkeleton variant="table" />;
  if (isError) return <QueryErrorView error={error} onRetry={refetch} />;
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return <EmptyState title="Недостаточно данных" description="Недостаточно данных для отчёта за выбранный период." />;
  }

  return <ReportTable data={Array.isArray(data) ? data : [data]} />;
}

/* ── Generic report table ── */

function ReportTable({ data }: { data: Record<string, unknown>[] }) {
  if (data.length === 0) return null;
  const keys = Object.keys(data[0]);

  return (
    <div className="bg-white rounded-lg shadow overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            {keys.map((k) => (
              <th key={k} className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">{k}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {keys.map((k) => (
                <td key={k} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                  {row[k] != null ? String(row[k]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Stat card ── */

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg shadow px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
