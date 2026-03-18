import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCases, fetchCase, createCase, updateCase, deleteCase,
  updateCaseStatus, setCaseFinalResult,
} from '../api/cases';
import toast from 'react-hot-toast';

export function useCasesList(params: {
  page?: number;
  status?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ['cases', params],
    queryFn: () => fetchCases(params),
    placeholderData: (prev) => prev,
  });
}

export function useCaseDetail(id: string) {
  return useQuery({
    queryKey: ['cases', id],
    queryFn: () => fetchCase(id),
    enabled: !!id,
  });
}

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCase,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      toast.success('Дело создано');
    },
  });
}

export function useUpdateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown> & { updatedAt: string }) =>
      updateCase(id, body as any),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['cases', vars.id] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      toast.success('Дело обновлено');
    },
  });
}

export function useDeleteCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCase,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      toast.success('Дело удалено');
    },
  });
}

export function useUpdateCaseStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: string; updatedAt: string }) =>
      updateCaseStatus(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['cases', vars.id] });
      qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}

export function useSetFinalResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; finalResult: string; updatedAt: string }) =>
      setCaseFinalResult(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['cases', vars.id] });
      toast.success('Результат установлен');
    },
  });
}
