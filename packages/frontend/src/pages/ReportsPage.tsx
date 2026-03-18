import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { fetchMyReport, fetchManagerReport, fetchCasesReport } from '../api/reports';
import { PageSkeleton } from '../components/PageSkeleton';
import { QueryErrorView } from '../components/QueryErrorView';
import { EmptyState } from '../components/EmptyState';

interface TabDef {
  key: string;
  label: string;
  adminOnly: boolean;
}

const TABS: TabDef[] = [
  { key: 'my', label: 'Мои показатели', adminOnly: false },
  { key: 'load', label: 'Нагрузка', adminOnly: true },
  { key: 'results', label: 'Результаты', adminOnly: true },
  { key: 'stale', label: 'Застой', adminOnly: true },
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

      {showPeriod && (
        <div className="flex gap-3 mb-4 items-center">
          <label className="text-sm text-gray-500">Период:</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          <span className="text-gray-400">—</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        </div>
      )}

      {activeTab === 'my' && <MyReportTab />}
      {activeTab === 'load' && <LoadTab />}
      {activeTab === 'results' && <ResultsTab />}
      {activeTab === 'stale' && <StaleTab />}
      {activeTab === 'cases' && <CasesTab dateFrom={dateFrom} dateTo={dateTo} />}
      {activeTab === 'finance' && <FinanceTab />}
    </div>
  );
}

/* ── My report ── */

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
      <StatCard label="Всего решённых" value={results?.decided ?? 0} />
    </div>
  );
}

/* ── Load tab ── */

function LoadTab() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports', 'manager', 'load'],
    queryFn: () => fetchManagerReport('load'),
  });

  if (isLoading) return <PageSkeleton variant="table" />;
  if (isError) return <QueryErrorView error={error} onRetry={refetch} />;
  if (!data?.length) return <EmptyState title="Недостаточно данных" description="Нет активных адвокатов." />;

  return (
    <Table>
      <Thead cols={['Адвокат', 'Активные', 'Закрытые', 'Всего']} />
      <tbody className="divide-y">
        {data.map((r: any) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <Td>{r.lastName} {r.firstName}</Td>
            <Td>{r.activeCases}</Td>
            <Td>{r.closedCases}</Td>
            <Td bold>{r.totalCases}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/* ── Results tab ── */

function ResultsTab() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports', 'manager', 'results'],
    queryFn: () => fetchManagerReport('results'),
  });

  if (isLoading) return <PageSkeleton variant="table" />;
  if (isError) return <QueryErrorView error={error} onRetry={refetch} />;
  if (!data?.length) return <EmptyState title="Недостаточно данных" description="Нет данных по результатам." />;

  return (
    <Table>
      <Thead cols={['Адвокат', 'Победы', 'Проигрыши', 'Частично', 'Решено', 'Win Rate']} />
      <tbody className="divide-y">
        {data.map((r: any) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <Td>{r.lastName} {r.firstName}</Td>
            <Td>{r.wins}</Td>
            <Td>{r.losses}</Td>
            <Td>{r.partial}</Td>
            <Td>{r.decided}</Td>
            <Td bold>{r.winRate != null ? `${r.winRate}%` : '—'}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/* ── Stale tab ── */

function StaleTab() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports', 'manager', 'stale'],
    queryFn: () => fetchManagerReport('stale'),
  });

  if (isLoading) return <PageSkeleton variant="table" />;
  if (isError) return <QueryErrorView error={error} onRetry={refetch} />;
  if (!data?.length) return <EmptyState title="Нет застоявшихся дел" description="Все дела имеют заседания за последние 30 дней." />;

  return (
    <Table>
      <Thead cols={['Дело', 'Адвокат', 'Последнее заседание', 'Дней без движения']} />
      <tbody className="divide-y">
        {data.map((r: any) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <td className="px-4 py-3">
              <Link to={`/cases/${r.id}`} className="font-medium text-blue-600 hover:text-blue-800">
                {r.name}
              </Link>
            </td>
            <Td>{r.lawyerName}</Td>
            <Td>{r.lastHearing ? new Date(r.lastHearing).toLocaleDateString('ru') : 'Нет'}</Td>
            <td className={`px-4 py-3 text-sm font-medium ${
              (r.daysInactive ?? 999) > 60 ? 'text-red-600' : 'text-yellow-600'
            }`}>
              {r.daysInactive ?? '∞'}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/* ── Cases tab ── */

function CasesTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports', 'cases', 'summary', dateFrom, dateTo],
    queryFn: () => fetchCasesReport('summary', dateFrom || undefined, dateTo || undefined),
  });

  if (isLoading) return <PageSkeleton variant="table" />;
  if (isError) return <QueryErrorView error={error} onRetry={refetch} />;
  if (!data?.length) return <EmptyState title="Недостаточно данных" description="Недостаточно данных для отчёта за выбранный период." />;

  return (
    <Table>
      <Thead cols={['Категория', 'Всего', 'Активные', 'Закрытые', 'Победы', 'Проигрыши']} />
      <tbody className="divide-y">
        {data.map((r: any) => (
          <tr key={r.category} className="hover:bg-gray-50">
            <Td bold>{CATEGORY_LABELS[r.category] ?? r.category}</Td>
            <Td>{r.total}</Td>
            <Td>{r.active}</Td>
            <Td>{r.closed}</Td>
            <Td>{r.wins}</Td>
            <Td>{r.losses}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/* ── Finance tab ── */

function FinanceTab() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports', 'manager', 'finance'],
    queryFn: () => fetchManagerReport('finance'),
  });

  if (isLoading) return <PageSkeleton variant="table" />;
  if (isError) return <QueryErrorView error={error} onRetry={refetch} />;
  if (!data?.length) return <EmptyState title="Недостаточно данных" description="Нет финансовых данных." />;

  return (
    <Table>
      <Thead cols={['Адвокат', 'Активные, ₽', 'Закрытые, ₽', 'Всего, ₽']} />
      <tbody className="divide-y">
        {data.map((r: any) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <Td>{r.lastName} {r.firstName}</Td>
            <Td>{fmtMoney(r.activeAmount)}</Td>
            <Td>{fmtMoney(r.closedAmount)}</Td>
            <Td bold>{fmtMoney(r.totalAmount)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/* ── Shared primitives ── */

const CATEGORY_LABELS: Record<string, string> = {
  civil: 'Гражданское', arbitration: 'Арбитраж', admin: 'Административное',
  criminal: 'Уголовное', labor: 'Трудовое',
};

function fmtMoney(v: number) {
  return v.toLocaleString('ru', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Thead({ cols }: { cols: string[] }) {
  return (
    <thead className="bg-gray-50 text-left">
      <tr>
        {cols.map((c) => (
          <th key={c} className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">{c}</th>
        ))}
      </tr>
    </thead>
  );
}

function Td({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return (
    <td className={`px-4 py-3 text-sm whitespace-nowrap ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
      {children}
    </td>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg shadow px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
