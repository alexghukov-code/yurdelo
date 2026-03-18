import api from './client';

const MAX_FILE_SIZE = 52_428_800; // 50 MB

export async function uploadDocument(
  hearingId: string,
  file: File,
  onProgress?: (pct: number) => void,
) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Файл превышает допустимый размер 50 МБ.');
  }

  const form = new FormData();
  form.append('file', file);

  const { data } = await api.post(`/hearings/${hearingId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  return data.data;
}

export async function getDocumentUrl(id: string): Promise<{ url: string; expiresAt: string }> {
  const { data } = await api.get<{ data: { url: string; expiresAt: string } }>(`/documents/${id}/url`);
  return data.data;
}

export async function deleteDocument(id: string) {
  await api.delete(`/documents/${id}`);
}
