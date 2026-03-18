import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useCaseDetail, useUpdateCaseStatus, useSetFinalResult, useDeleteCase } from '../hooks/useCases';
import { useAuth } from '../hooks/useAuth';
import { CardSkeleton } from '../components/Skeleton';
import { ErrorAlert } from '../components/ErrorAlert';
import { StaleDataModal } from '../components/StaleDataModal';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { PermissionGate } from '../components/PermissionGate';

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: caseData, isLoading, isError, error, refetch } = useCaseDetail(id!);
  const updateStatus = useUpdateCaseStatus();
  const setResult = useSetFinalResult();
  const deleteCase = useDeleteCase();
  const [staleOpen, setStaleOpen] = useState(false);

  if (isLoading) return <CardSkeleton />;
  if (isError) {
    const status = (error as any)?.response?.status;
    if (status === 403) {
      return <ErrorAlert message="Нет доступа. Обратитесь к руководителю." />;
    }
    if (status === 404) {
      return <ErrorAlert message="Дело не найдено." />;
    }
    return <ErrorAlert message="Не удалось загрузить дело." onRetry={() => refetch()} />;
  }
  if (!caseData) return null;

  const c = caseData;
  const isOwner = user?.role === 'lawyer' && c.lawyerId === user.id;
  const canEdit = user?.role === 'admin' || isOwner;

  return (
    <div>
      <StaleDataModal open={staleOpen} onRefresh={() => { setStaleOpen(false); refetch(); }} />

      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Назад
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{c.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {c.pltName} vs {c.defName} &middot; {c.category} &middot; {c.lawyerName}
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && c.status === 'active' && (
            <button
              onClick={() =>
                updateStatus.mutate(
                  { id: c.id, status: 'closed', updatedAt: c.updatedAt },
                  { onError: () => setStaleOpen(true) },
                )
              }
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              Закрыть дело
            </button>
          )}
          <PermissionGate roles={['admin']}>
            <button
              onClick={() => {
                if (confirm('Удалить дело?')) deleteCase.mutate(c.id, { onSuccess: () => navigate('/') });
              }}
              className="p-1.5 text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <InfoCard label="Статус" value={statusLabel(c.status)} />
        <InfoCard label="Результат" value={c.finalResult ?? '—'} />
        <InfoCard label="Цена иска" value={c.claimAmount ? `${c.claimAmount.toLocaleString('ru')} ₽` : '—'} />
        <InfoCard label="Создано" value={new Date(c.createdAt).toLocaleDateString('ru')} />
      </div>

      {/* Final result suggestion */}
      {canEdit && c.status === 'closed' && !c.finalResult && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800 font-medium">Установите итоговый результат дела</p>
          <div className="flex gap-2 mt-2">
            {['win', 'lose', 'part', 'world'].map((r) => (
              <button
                key={r}
                onClick={() => setResult.mutate({ id: c.id, finalResult: r, updatedAt: c.updatedAt })}
                className="px-3 py-1 text-xs rounded-lg border border-yellow-300 hover:bg-yellow-100"
              >
                {resultLabel(r)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stages + hearings */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Стадии</h2>
      {(!c.stages || c.stages.length === 0) ? (
        <p className="text-sm text-gray-400">Стадий пока нет.</p>
      ) : (
        <div className="space-y-4">
          {c.stages.map((s) => (
            <div key={s.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">{s.stageTypeName}</h3>
                <span className="text-xs text-gray-500">{s.court} &middot; {s.caseNumber}</span>
              </div>
              {s.hearings.length === 0 ? (
                <p className="text-sm text-gray-400">Слушаний нет.</p>
              ) : (
                <div className="space-y-2">
                  {s.hearings.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-sm border-t pt-2">
                      <div>
                        <span className="font-medium">{hearingTypeLabel(h.type)}</span>
                        <span className="text-gray-500 ml-2">
                          {new Date(h.datetime).toLocaleString('ru', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {h.result && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          {resultLabel(h.result)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg shadow px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function statusLabel(s: string) {
  const m: Record<string, string> = { active: 'Активно', closed: 'Закрыто', suspended: 'Приостановлено' };
  return m[s] ?? s;
}

function resultLabel(r: string) {
  const m: Record<string, string> = { win: 'Победа', lose: 'Проигрыш', part: 'Частично', world: 'Мировое' };
  return m[r] ?? r;
}

function hearingTypeLabel(t: string) {
  const m: Record<string, string> = { hearing: 'Заседание', adj: 'Перенос', result: 'Результат', note: 'Заметка' };
  return m[t] ?? t;
}
