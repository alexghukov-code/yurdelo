import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Download, Trash2, Upload } from 'lucide-react';
import { uploadDocument, getDocumentUrl, deleteDocument } from '../api/documents';
import { useAuth } from '../hooks/useAuth';
import { usePermission } from '../hooks/usePermission';
import toast from 'react-hot-toast';
import type { HearingDocument } from '../api/cases';

interface DocumentListProps {
  hearingId: string;
  caseId: string;
  documents: HearingDocument[];
  canEdit: boolean;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function DocumentList({ hearingId, caseId, documents, canEdit }: DocumentListProps) {
  const { user } = useAuth();
  const canUpload = usePermission('document:upload') && canEdit;
  const canDelete = usePermission('document:delete');
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadDocument(hearingId, file, setProgress),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases', caseId] });
      toast.success('Файл загружен');
      setProgress(null);
    },
    onError: (err) => {
      setProgress(null);
      if (err instanceof Error && err.message.includes('50 МБ')) {
        toast.error(err.message);
      }
      // other errors handled by global handler
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases', caseId] });
      toast.success('Файл удалён');
    },
  });

  async function handleDownload(docId: string) {
    try {
      const { url } = await getDocumentUrl(docId);
      window.open(url, '_blank');
    } catch {
      toast.error('Не удалось получить ссылку на файл.');
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMut.mutate(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="mt-2">
      {documents.length === 0 && !canUpload && (
        <p className="text-xs text-gray-400">Документов нет.</p>
      )}

      {documents.length > 0 && (
        <div className="space-y-1">
          {documents.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1.5"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate text-gray-700">{d.fileName}</span>
                <span className="text-gray-400 flex-shrink-0">({fmtSize(d.fileSize)})</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleDownload(d.id)}
                  className="p-1 text-blue-500 hover:text-blue-700"
                  title="Скачать"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                {canDelete && canEdit && (user?.role === 'admin' || d.uploadedBy === user?.id) && (
                  <button
                    onClick={() => {
                      if (confirm('Удалить файл?')) deleteMut.mutate(d.id);
                    }}
                    className="p-1 text-red-400 hover:text-red-600"
                    title="Удалить"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload */}
      {canUpload && (
        <div className="mt-1.5">
          {progress !== null ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">{progress}%</span>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadMut.isPending}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <Upload className="h-3.5 w-3.5" />
              Файл
            </button>
          )}
          <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect} />
        </div>
      )}
    </div>
  );
}
