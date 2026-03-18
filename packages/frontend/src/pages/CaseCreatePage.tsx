import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCreateCase } from '../hooks/useCases';
import { CaseForm } from '../components/CaseForm';

export function CaseCreatePage() {
  const navigate = useNavigate();
  const createCase = useCreateCase();

  return (
    <div className="max-w-lg">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Назад
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Новое дело</h1>

      <CaseForm
        mode="create"
        isSubmitting={createCase.isPending}
        onCancel={() => navigate(-1)}
        onSubmit={(values) => {
          createCase.mutate(
            {
              name: values.name,
              pltId: values.pltId,
              defId: values.defId,
              category: values.category,
              claimAmount: values.claimAmount ? Number(values.claimAmount) : undefined,
            },
            { onSuccess: (newCase) => navigate(`/cases/${newCase.id}`) },
          );
        }}
      />
    </div>
  );
}
