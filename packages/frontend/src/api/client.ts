import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token?: string) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  failedQueue = [];
}

// ── Request: attach access token ──────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: handle 401 → silent refresh ─────────────
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    const isAuthRoute = original.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !original._retry && !isAuthRoute) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token) => {
              original.headers.Authorization = `Bearer ${token}`;
              resolve(api(original));
            },
            reject,
          });
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post('/api/v1/auth/refresh', null, {
          withCredentials: true,
        });
        const newToken = data.data.accessToken;
        localStorage.setItem('accessToken', newToken);
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError);
        localStorage.removeItem('accessToken');
        const returnTo = window.location.pathname;
        window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;

// ── Typed error extraction ────────────────────────────
export interface ApiError {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export function extractError(err: unknown): ApiError {
  if (axios.isAxiosError(err) && err.response?.data?.error) {
    return err.response.data.error;
  }
  return { code: 'UNKNOWN', message: 'Ошибка соединения с сервером.' };
}

export function isStaleDataError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 409;
}

export function getHttpStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

export function getRetryAfter(err: unknown): number | undefined {
  if (!axios.isAxiosError(err) || err.response?.status !== 429) return undefined;
  const header = err.response.headers?.['retry-after'];
  if (!header) return undefined;
  const seconds = parseInt(header, 10);
  return isNaN(seconds) ? undefined : seconds;
}
