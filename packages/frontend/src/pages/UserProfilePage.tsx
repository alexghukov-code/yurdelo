import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Pencil, Clock } from 'lucide-react';
import { fetchUser, updateUser, fetchUserHistory } from '../api/users';
import { changePassword } from '../api/auth';
import { isStaleDataError } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { PageSkeleton } from '../components/PageSkeleton';
import { QueryErrorView } from '../components/QueryErrorView';
import { StaleDataModal } from '../components/StaleDataModal';
import { DeactivateUserModal } from '../components/DeactivateUserModal';
import { RestoreUserModal } from '../components/RestoreUserModal';
import toast from 'react-hot-toast';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Руководитель', lawyer: 'Адвокат', viewer: 'Наблюдатель',
};
const STATUS_LABELS: Record<string, string> = {
  active: 'Активен', inactive: 'Неактивен',
};
const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800', inactive: 'bg-gray-100 text-gray-800',
};
const EVENT_LABELS: Record<string, string> = {
  created: 'Создание', activated: 'Активация', deactivated: 'Деактивация',
  restored: 'Восстановление', role_changed: 'Смена роли', password_changed: 'Смена пароля',
  profile_updated: 'Обновление профиля',
};

export function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [staleOpen, setStaleOpen] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showRestore, setShowRestore] = useState(false);

  const { data: profile, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['users', id],
    queryFn: () => fetchUser(id!),
    enabled: !!id,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['users', id, 'history'],
    queryFn: () => fetchUserHistory(id!),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown> & { updatedAt: string }) => updateUser(id!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', id] });
      toast.success('Профиль обновлён');
      setEditing(false);
    },
    onError: (err) => {
      if (isStaleDataError(err)) setStaleOpen(true);
    },
  });

  if (isLoading) return <PageSkeleton />;
  if (isError) return <QueryErrorView error={error} onRetry={refetch} />;
  if (!profile) return null;

  const isAdmin = currentUser?.role === 'admin';
  const isSelf = currentUser?.id === profile.id;
  const isLawyerSelf = currentUser?.role === 'lawyer' && isSelf;
  const canEdit = isAdmin || isLawyerSelf;

  return (
    <div>
      <StaleDataModal open={staleOpen} onRefresh={() => { setStaleOpen(false); setEditing(false); refetch(); }} />

      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Назад
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {profile.lastName} {profile.firstName}{profile.middleName ? ` ${profile.middleName}` : ''}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">{ROLE_LABELS[profile.role] ?? profile.role}</span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[profile.status] ?? ''}`}>
              {STATUS_LABELS[profile.status] ?? profile.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Редактировать
            </button>
          )}
          {isAdmin && !isSelf && profile.status === 'active' && (
            <button
              onClick={() => setShowDeactivate(true)}
              className="px-3 py-1.5 text-sm rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
            >
              Деактивировать
            </button>
          )}
          {isAdmin && profile.status === 'inactive' && (
            <button
              onClick={() => setShowRestore(true)}
              className="px-3 py-1.5 text-sm rounded-lg border border-green-300 text-green-700 hover:bg-green-50"
            >
              Восстановить
            </button>
          )}
        </div>
      </div>

      {/* Profile section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Профиль</h2>
        {editing ? (
          <EditForm
            profile={profile}
            isAdmin={isAdmin}
            isSubmitting={mutation.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={(values) => mutation.mutate({ ...values, updatedAt: profile.updatedAt! })}
          />
        ) : (
          <ProfileFields profile={profile} isAdmin={isAdmin} />
        )}
      </div>

      {/* Change password — own profile only */}
      {isSelf && <ChangePasswordSection />}

      {/* History section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-gray-400" />
          История
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">Событий нет.</p>
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="flex items-start gap-3 text-sm border-l-2 border-gray-200 pl-4">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{EVENT_LABELS[h.event] ?? h.event}</p>
                  {h.comment && <p className="text-gray-500 mt-0.5">{h.comment}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(h.eventDate).toLocaleDateString('ru')}
                    {h.performedBy && ` · ${h.performedBy}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDeactivate && (
        <DeactivateUserModal
          userId={profile.id}
          userName={`${profile.lastName} ${profile.firstName}`}
          onClose={() => { setShowDeactivate(false); refetch(); }}
        />
      )}
      {showRestore && (
        <RestoreUserModal
          userId={profile.id}
          userName={`${profile.lastName} ${profile.firstName}`}
          previousRole={profile.role}
          onClose={() => { setShowRestore(false); refetch(); }}
        />
      )}
    </div>
  );
}

/* ── Change password ── */

interface PasswordFormValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

function ChangePasswordSection() {
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<PasswordFormValues>();

  const mutation = useMutation({
    mutationFn: ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) =>
      changePassword({ oldPassword, newPassword }),
    onSuccess: () => {
      toast.success('Пароль изменён. Все сессии завершены.');
      reset();
    },
  });

  const newPassword = watch('newPassword');

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Смена пароля</h2>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3 max-w-md">
        <div>
          <label htmlFor="cp-old" className="block text-xs text-gray-500 mb-1">Текущий пароль</label>
          <input id="cp-old" type="password" autoComplete="current-password"
            {...register('oldPassword', { required: 'Обязательно.' })}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.oldPassword ? 'border-red-300' : 'border-gray-300'}`} />
          {errors.oldPassword && <p className="text-xs text-red-600 mt-1">{errors.oldPassword.message}</p>}
        </div>
        <div>
          <label htmlFor="cp-new" className="block text-xs text-gray-500 mb-1">Новый пароль</label>
          <input id="cp-new" type="password" autoComplete="new-password"
            {...register('newPassword', {
              required: 'Обязательно.',
              minLength: { value: 8, message: 'Минимум 8 символов.' },
              pattern: { value: /(?=.*[a-zA-Zа-яА-Я])(?=.*\d)/, message: 'Буква + цифра обязательны.' },
            })}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.newPassword ? 'border-red-300' : 'border-gray-300'}`} />
          {errors.newPassword && <p className="text-xs text-red-600 mt-1">{errors.newPassword.message}</p>}
        </div>
        <div>
          <label htmlFor="cp-confirm" className="block text-xs text-gray-500 mb-1">Подтверждение</label>
          <input id="cp-confirm" type="password" autoComplete="new-password"
            {...register('confirmPassword', {
              required: 'Обязательно.',
              validate: (v) => v === newPassword || 'Пароли не совпадают.',
            })}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.confirmPassword ? 'border-red-300' : 'border-gray-300'}`} />
          {errors.confirmPassword && <p className="text-xs text-red-600 mt-1">{errors.confirmPassword.message}</p>}
        </div>
        <p className="text-xs text-gray-400">Минимум 8 символов, буква + цифра.</p>
        <button type="submit" disabled={mutation.isPending}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {mutation.isPending ? 'Сохранение...' : 'Изменить пароль'}
        </button>
      </form>
    </div>
  );
}

/* ── Read-only fields ── */

function ProfileFields({ profile, isAdmin }: { profile: any; isAdmin: boolean }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Фамилия" value={profile.lastName} />
      <Field label="Имя" value={profile.firstName} />
      <Field label="Отчество" value={profile.middleName ?? '—'} />
      <Field label="Роль" value={ROLE_LABELS[profile.role] ?? profile.role} />
      {isAdmin && <Field label="Email" value={profile.email ?? '—'} />}
      {isAdmin && <Field label="Телефон" value={profile.phone ?? '—'} />}
      {isAdmin && <Field label="2FA" value={profile.twoFaEnabled ? 'Включена' : 'Отключена'} />}
      {isAdmin && <Field label="Создан" value={profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('ru') : '—'} />}
    </dl>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}

/* ── Edit form ── */

interface EditFormValues {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  email?: string;
  phone?: string;
  role?: string;
}

function EditForm({
  profile,
  isAdmin,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  profile: any;
  isAdmin: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: EditFormValues) => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<EditFormValues>({
    defaultValues: {
      lastName: profile.lastName,
      firstName: profile.firstName,
      middleName: profile.middleName ?? '',
      email: profile.email ?? '',
      phone: profile.phone ?? '',
      role: profile.role,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
      {isAdmin && (
        <>
          <div>
            <label htmlFor="up-last" className="block text-xs text-gray-500 mb-1">Фамилия</label>
            <input id="up-last" {...register('lastName', { required: 'Обязательно.', minLength: { value: 2, message: 'Минимум 2 символа.' } })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.lastName ? 'border-red-300' : 'border-gray-300'}`} />
            {errors.lastName && <p className="text-xs text-red-600 mt-1">{errors.lastName.message}</p>}
          </div>
          <div>
            <label htmlFor="up-first" className="block text-xs text-gray-500 mb-1">Имя</label>
            <input id="up-first" {...register('firstName', { required: 'Обязательно.', minLength: { value: 2, message: 'Минимум 2 символа.' } })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.firstName ? 'border-red-300' : 'border-gray-300'}`} />
            {errors.firstName && <p className="text-xs text-red-600 mt-1">{errors.firstName.message}</p>}
          </div>
          <div>
            <label htmlFor="up-mid" className="block text-xs text-gray-500 mb-1">Отчество</label>
            <input id="up-mid" {...register('middleName')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="up-role" className="block text-xs text-gray-500 mb-1">Роль</label>
            <select id="up-role" {...register('role')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="admin">Руководитель</option>
              <option value="lawyer">Адвокат</option>
              <option value="viewer">Наблюдатель</option>
            </select>
          </div>
        </>
      )}

      {/* Email & phone — editable for admin and lawyer-self */}
      <div>
        <label htmlFor="up-email" className="block text-xs text-gray-500 mb-1">Email</label>
        <input id="up-email" type="email" {...register('email', { required: 'Обязательно.' })}
          className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.email ? 'border-red-300' : 'border-gray-300'}`} />
        {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="up-phone" className="block text-xs text-gray-500 mb-1">Телефон</label>
        <input id="up-phone" {...register('phone')}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          Отмена
        </button>
        <button type="submit" disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {isSubmitting ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}
