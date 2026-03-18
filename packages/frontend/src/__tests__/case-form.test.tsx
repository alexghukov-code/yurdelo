import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { renderWithProviders } from './renderWith';
import { Routes, Route } from 'react-router-dom';
import { CaseForm } from '../components/CaseForm';

const PARTIES = [
  { id: 'p1', name: 'ООО Альфа', inn: '1234567890', createdAt: '', updatedAt: '' },
  { id: 'p2', name: 'ИП Смирнов', inn: null, createdAt: '', updatedAt: '' },
];

function setup(role: 'admin' | 'lawyer' = 'lawyer') {
  localStorage.setItem('accessToken', 'valid-token');
  server.use(
    http.get('/api/v1/auth/me', () =>
      HttpResponse.json({
        data: {
          id: 'u1',
          email: `${role}@test.ru`,
          role,
          firstName: 'Мария',
          lastName: 'Петрова',
          twoFaEnabled: false,
        },
      }),
    ),
    http.get('/api/v1/parties', () =>
      HttpResponse.json({ data: PARTIES, meta: { page: 1, limit: 50, total: 2, totalPages: 1 } }),
    ),
  );
}

function renderForm(props: Partial<React.ComponentProps<typeof CaseForm>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();

  return {
    onSubmit,
    onCancel,
    ...renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={<CaseForm mode="create" onSubmit={onSubmit} onCancel={onCancel} {...props} />}
        />
      </Routes>,
    ),
  };
}

describe('CaseForm', () => {
  beforeEach(() => {
    localStorage.clear();
    setup();
  });

  it('renders all fields in create mode', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByLabelText(/Название дела/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Категория/)).toBeInTheDocument();
    expect(screen.getByText('Истец')).toBeInTheDocument();
    expect(screen.getByText('Ответчик')).toBeInTheDocument();
    expect(screen.getByLabelText(/Цена иска/)).toBeInTheDocument();
    expect(screen.getByText('Создать')).toBeInTheDocument();
  });

  it('shows edit button label in edit mode', async () => {
    renderForm({
      mode: 'edit',
      initialData: {
        id: 'c1',
        name: 'Дело',
        category: 'civil',
        pltId: 'p1',
        defId: 'p2',
        lawyerId: 'u1',
        status: 'active',
        finalResult: null,
        claimAmount: 1000,
        closedAt: null,
        createdAt: '',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Сохранить')).toBeInTheDocument();
    });
  });

  it('validates required name', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByText('Создать')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Создать'));

    await waitFor(() => {
      expect(screen.getByText('Название обязательно.')).toBeInTheDocument();
    });
  });

  it('validates required category', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByLabelText(/Название дела/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Название дела/), {
      target: { value: 'Тестовое дело' },
    });
    fireEvent.click(screen.getByText('Создать'));

    await waitFor(() => {
      expect(screen.getByText('Категория обязательна.')).toBeInTheDocument();
    });
  });

  it('shows warning when plaintiff equals defendant', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getAllByText(/ООО Альфа/).length).toBeGreaterThan(0);
    });

    const selects = screen.getAllByRole('listbox');
    fireEvent.change(selects[0], { target: { value: 'p1' } });
    fireEvent.change(selects[1], { target: { value: 'p1' } });

    await waitFor(() => {
      expect(screen.getByText('Истец и ответчик совпадают.')).toBeInTheDocument();
    });
  });

  it('no warning when plaintiff differs from defendant', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getAllByText(/ООО Альфа/).length).toBeGreaterThan(0);
    });

    const selects = screen.getAllByRole('listbox');
    fireEvent.change(selects[0], { target: { value: 'p1' } });
    fireEvent.change(selects[1], { target: { value: 'p2' } });

    expect(screen.queryByText('Истец и ответчик совпадают.')).not.toBeInTheDocument();
  });

  it('calls onCancel when cancel button clicked', async () => {
    const { onCancel } = renderForm();

    await waitFor(() => {
      expect(screen.getByText('Отмена')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Отмена'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables submit when isSubmitting', async () => {
    renderForm({ isSubmitting: true });

    await waitFor(() => {
      expect(screen.getByText('Сохранение...')).toBeInTheDocument();
    });
    expect(screen.getByText('Сохранение...').closest('button')).toBeDisabled();
  });

  it('prefills fields in edit mode', async () => {
    renderForm({
      mode: 'edit',
      initialData: {
        id: 'c1',
        name: 'Взыскание',
        category: 'arbitration',
        pltId: 'p1',
        defId: 'p2',
        lawyerId: 'u1',
        status: 'active',
        finalResult: null,
        claimAmount: 500000,
        closedAt: null,
        createdAt: '',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Название дела/)).toHaveValue('Взыскание');
    });
    expect(screen.getByLabelText(/Цена иска/)).toHaveValue(500000);
  });
});
