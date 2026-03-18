import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useCaseDetail,
  useUpdateCase,
  useUpdateCaseStatus,
  useSetFinalResult,
  useDeleteCase,
} from '../hooks/useCases';
import { useAuth } from '../hooks/useAuth';
import { isStaleDataError } from '../api/client';
import { PageSkeleton } from '../components/PageSkeleton';
import { QueryErrorView } from '../components/QueryErrorView';
import { StaleDataModal } from '../components/StaleDataModal';
import { CaseForm, type CaseFormValues } from '../components/CaseForm';
import { ArrowLeft, Trash2, Pencil, Plus } from 'lucide-react';
import { StageFormModal } from '../components/StageFormModal';
import { HearingFormModal } from '../components/HearingFormModal';
import { TransferModal } from '../components/TransferModal';
import { DocumentList } from '../components/DocumentList';
import type { Stage, Hearing } from '../api/cases';
import { fetchTransfers } from '../api/transfers';
import { PermissionGate } from '../components/PermissionGate';
import { usePermission } from '../hooks/usePermission';
import { StatusMenu } from '../components/StatusMenu';
import { FinalResultMenu } from '../components/FinalResultMenu';

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: caseData, isLoading, isError, error, refetch } = useCaseDetail(id!);
  const updateCase = useUpdateCase();
  const updateStatus = useUpdateCaseStatus();
  const setResult = useSetFinalResult();
  const deleteCase = useDeleteCase();
  const [editing, setEditing] = useState(false);
  const [staleOpen, setStaleOpen] = useState(false);
  const [stageModal, setStageModal] = useState<{ mode: 'create' | 'edit'; stage?: Stage } | null>(
    null,
  );
  const [hearingModal, setHearingModal] = useState<{
    mode: 'create' | 'edit';
    stageId: string;
    hearing?: Hearing;
  } | null>(null);
  const [resultSuggestion, setResultSuggestion] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);

  const { data: transfers = [] } = useQuery({
    queryKey: ['transfers', id],
    queryFn: () => fetchTransfers(id!),
    enabled: !!id,
  });

  if (isLoading) return <PageSkeleton />;
  if (isError) return <QueryErrorView error={error} onRetry={refetch} />;
  if (!caseData) return null;

  const c = caseData;
  const canEditRole = usePermission('case:edit');
  const isOwner = user?.role === 'lawyer' && c.lawyerId === user.id;
  const canEdit = canEditRole && (user?.role === 'admin' || isOwner);

  function handleStaleRefresh() {
    setStaleOpen(false);
    setEditing(false);
    refetch();
  }

  function handleEditSubmit(values: CaseFormValues & { updatedAt?: string }) {
    updateCase.mutate(
      {
        id: c.id,
        name: values.name,
        category: values.category,
        pltId: values.pltId,
        defId: values.defId,
        claimAmount: values.claimAmount ? Number(values.claimAmount) : null,
        updatedAt: values.updatedAt!,
      },
      {
        onSuccess: () => {
          setEditing(false);
          refetch();
        },
        onError: (err) => {
          if (isStaleDataError(err)) setStaleOpen(true);
          // non-409 errors handled by global onError
        },
      },
    );
  }

  return (
    <div>
      <StaleDataModal open={staleOpen} onRefresh={handleStaleRefresh} />

      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Назад
      </button>

      {editing ? (
        /* ── Edit mode ── */
        <div className="max-w-lg">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Редактирование дела</h1>
          <CaseForm
            mode="edit"
            initialData={c}
            isSubmitting={updateCase.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={handleEditSubmit}
          />
        </div>
      ) : (
        /* ── View mode ── */
        <>
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{c.name}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {c.pltName ?? '—'} vs {c.defName ?? '—'} &middot; {c.category} &middot; {c.lawyerName ?? '—'}
              </p>
            </div>
            <div className="flex gap-2">
              {canEdit && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Редактировать
                </button>
              )}
              {canEdit && (
                <StatusMenu
                  currentStatus={c.status}
                  onChangeStatus={(newStatus) =>
                    updateStatus.mutate(
                      { id: c.id, status: newStatus, updatedAt: c.updatedAt },
                      {
                        onError: (err) => {
                          if (isStaleDataError(err)) setStaleOpen(true);
                        },
                      },
                    )
                  }
                />
              )}
              <PermissionGate allow="case:delete">
                <button
                  onClick={() => {
                    if (confirm('Удалить дело?'))
                      deleteCase.mutate(c.id, { onSuccess: () => navigate('/') });
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
            <div className="bg-white rounded-lg shadow px-4 py-3">
              <p className="text-xs text-gray-500">Результат</p>
              <div className="mt-0.5">
                {canEdit && c.status === 'closed' ? (
                  <FinalResultMenu
                    currentResult={c.finalResult}
                    onSetResult={(result) =>
                      setResult.mutate(
                        { id: c.id, finalResult: result, updatedAt: c.updatedAt },
                        {
                          onError: (err) => {
                            if (isStaleDataError(err)) setStaleOpen(true);
                          },
                        },
                      )
                    }
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-900">
                    {resultLabel(c.finalResult) ?? '—'}
                  </p>
                )}
              </div>
            </div>
            <InfoCard
              label="Цена иска"
              value={c.claimAmount != null ? `${c.claimAmount.toLocaleString('ru')} ₽` : '—'}
            />
            <InfoCard label="Создано" value={new Date(c.createdAt).toLocaleDateString('ru')} />
          </div>

          {/* Stages + hearings */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Стадии</h2>
            {canEdit && (
              <button
                onClick={() => setStageModal({ mode: 'create' })}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
              >
                <Plus className="h-4 w-4" />
                Стадия
              </button>
            )}
          </div>
          {!c.stages || c.stages.length === 0 ? (
            <p className="text-sm text-gray-400">Стадий пока нет.</p>
          ) : (
            <div className="space-y-4">
              {c.stages.map((s) => (
                <div key={s.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-900">{s.stageTypeName}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {s.court} &middot; {s.caseNumber}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => setStageModal({ mode: 'edit', stage: s })}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {s.hearings.length === 0 ? (
                    <p className="text-sm text-gray-400">Слушаний нет.</p>
                  ) : (
                    <div className="space-y-2">
                      {s.hearings.map((h) => (
                        <div key={h.id} className="border-t pt-2">
                          <div className="flex items-center justify-between text-sm">
                            <div>
                              <span className="font-medium">{hearingTypeLabel(h.type)}</span>
                              <span className="text-gray-500 ml-2">
                                {new Date(h.datetime).toLocaleString('ru', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {h.result && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                  {resultLabel(h.result)}
                                </span>
                              )}
                              {canEdit && (
                                <button
                                  onClick={() =>
                                    setHearingModal({ mode: 'edit', stageId: s.id, hearing: h })
                                  }
                                  className="p-1 text-gray-400 hover:text-gray-600"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <DocumentList
                            hearingId={h.id}
                            caseId={c.id}
                            documents={h.documents ?? []}
                            canEdit={canEdit}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => setHearingModal({ mode: 'create', stageId: s.id })}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-2"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Слушание
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Result suggestion banner */}
          {resultSuggestion && c.status === 'closed' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
              <p className="text-sm text-blue-800 font-medium">
                Обновить итоговый результат дела до «{resultLabel(resultSuggestion)}»?
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    setResult.mutate({
                      id: c.id,
                      finalResult: resultSuggestion,
                      updatedAt: c.updatedAt,
                    });
                    setResultSuggestion(null);
                  }}
                  className="px-3 py-1 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  Да
                </button>
                <button
                  onClick={() => setResultSuggestion(null)}
                  className="px-3 py-1 text-xs rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  Нет
                </button>
              </div>
            </div>
          )}

          {stageModal && (
            <StageFormModal
              mode={stageModal.mode}
              caseId={c.id}
              existingStages={c.stages ?? []}
              initialData={stageModal.stage}
              onClose={() => setStageModal(null)}
              onStale={() => {
                setStageModal(null);
                setStaleOpen(true);
              }}
            />
          )}

          {hearingModal && (
            <HearingFormModal
              mode={hearingModal.mode}
              stageId={hearingModal.stageId}
              caseId={c.id}
              initialData={hearingModal.hearing}
              onClose={() => setHearingModal(null)}
              onStale={() => {
                setHearingModal(null);
                setStaleOpen(true);
              }}
              onResultCreated={(result) => setResultSuggestion(result)}
            />
          )}

          {/* Transfers */}
          <div className="flex items-center justify-between mt-8 mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Передачи</h2>
            {canEdit && (
              <button
                onClick={() => setShowTransfer(true)}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
              >
                Передать дело
              </button>
            )}
          </div>
          {transfers.length === 0 ? (
            <p className="text-sm text-gray-400">Передач нет.</p>
          ) : (
            <div className="space-y-3">
              {transfers.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start gap-3 text-sm border-l-2 border-gray-200 pl-4"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {t.fromName ?? '—'} → {t.toName ?? '—'}
                    </p>
                    {t.comment && <p className="text-gray-500 mt-0.5">{t.comment}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(t.transferDate).toLocaleDateString('ru')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showTransfer && (
            <TransferModal
              caseId={c.id}
              caseName={c.name}
              currentLawyerId={c.lawyerId}
              currentLawyerName={c.lawyerName ?? ''}
              onClose={() => {
                setShowTransfer(false);
                refetch();
              }}
            />
          )}
        </>
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
  const m: Record<string, string> = {
    active: 'Активно',
    closed: 'Закрыто',
    suspended: 'Приостановлено',
  };
  return m[s] ?? s;
}

function resultLabel(r: string | null) {
  if (!r) return '—';
  const m: Record<string, string> = {
    win: 'Победа',
    lose: 'Проигрыш',
    part: 'Частично',
    world: 'Мировое',
  };
  return m[r] ?? r;
}

function hearingTypeLabel(t: string) {
  const m: Record<string, string> = {
    hearing: 'Заседание',
    adj: 'Перенос',
    result: 'Результат',
    note: 'Заметка',
  };
  return m[t] ?? t;
}
