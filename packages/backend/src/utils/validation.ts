import { z } from 'zod';
import { AppError } from './errors.js';

export const loginSchema = z.object({
  email: z.string().email('Некорректный формат email.'),
  password: z.string().min(1, 'Пароль обязателен.'),
  totp_code: z.string().length(6).optional(),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Текущий пароль обязателен.'),
  newPassword: z
    .string()
    .min(8, 'Минимальная длина пароля — 8 символов.')
    .regex(/[a-zA-Zа-яА-Я]/, 'Пароль должен содержать буквы.')
    .regex(/\d/, 'Пароль должен содержать цифры.'),
});

export const verify2faSchema = z.object({
  code: z.string().length(6, 'Код должен содержать 6 цифр.'),
});

// ── Users ─────────────────────────────────────────────

const passwordRule = z
  .string()
  .min(8, 'Минимальная длина пароля — 8 символов.')
  .regex(/[a-zA-Zа-яА-Я]/, 'Пароль должен содержать буквы.')
  .regex(/\d/, 'Пароль должен содержать цифры.');

export const createUserSchema = z.object({
  email: z.string().email('Некорректный формат email.'),
  password: passwordRule,
  lastName: z.string().min(2, 'Минимум 2 символа.'),
  firstName: z.string().min(2, 'Минимум 2 символа.'),
  middleName: z.string().optional(),
  role: z.enum(['admin', 'lawyer', 'viewer']),
  phone: z.string().optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email('Некорректный формат email.').optional(),
  phone: z.string().nullable().optional(),
  lastName: z.string().min(2, 'Минимум 2 символа.').optional(),
  firstName: z.string().min(2, 'Минимум 2 символа.').optional(),
  middleName: z.string().nullable().optional(),
  role: z.enum(['admin', 'lawyer', 'viewer']).optional(),
  updatedAt: z.string({ required_error: 'updatedAt обязателен для optimistic locking.' }),
});

export const deactivateUserSchema = z.object({
  date: z.string({ required_error: 'Дата обязательна.' }),
  reason: z.string().min(1, 'Причина обязательна.'),
  comment: z.string().optional(),
  transferToId: z.string().uuid().optional(),
});

export const restoreUserSchema = z.object({
  date: z.string({ required_error: 'Дата обязательна.' }),
  role: z.enum(['admin', 'lawyer', 'viewer']),
  comment: z.string().optional(),
});

// ── Parties ───────────────────────────────────────────

export const createPartySchema = z.object({
  name: z.string().min(2, 'Минимум 2 символа.'),
  inn: z.string().max(12).optional(),
  ogrn: z.string().max(15).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Некорректный email.').optional(),
});

export const updatePartySchema = z.object({
  name: z.string().min(2).optional(),
  inn: z.string().max(12).nullable().optional(),
  ogrn: z.string().max(15).nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email('Некорректный email.').nullable().optional(),
  updatedAt: z.string({ required_error: 'updatedAt обязателен для optimistic locking.' }),
});

// ── Cases ─────────────────────────────────────────────

const categoryEnum = z.enum(['civil', 'arbitration', 'admin', 'criminal', 'labor']);
const caseStatusEnum = z.enum(['active', 'closed', 'suspended']);
const finalResultEnum = z.enum(['win', 'lose', 'part', 'world']);

export const createCaseSchema = z.object({
  name: z.string().min(3, 'Минимум 3 символа.'),
  pltId: z.string().uuid(),
  defId: z.string().uuid(),
  lawyerId: z.string().uuid().optional(),
  category: categoryEnum,
  claimAmount: z.number().min(0).optional(),
});

export const updateCaseSchema = z.object({
  name: z.string().min(3).optional(),
  pltId: z.string().uuid().optional(),
  defId: z.string().uuid().optional(),
  category: categoryEnum.optional(),
  claimAmount: z.number().min(0).nullable().optional(),
  updatedAt: z.string({ required_error: 'updatedAt обязателен для optimistic locking.' }),
});

export const changeCaseStatusSchema = z.object({
  status: caseStatusEnum,
  updatedAt: z.string({ required_error: 'updatedAt обязателен.' }),
});

export const setFinalResultSchema = z.object({
  finalResult: finalResultEnum,
  updatedAt: z.string({ required_error: 'updatedAt обязателен.' }),
});

// ── Stages ────────────────────────────────────────────

export const createStageSchema = z.object({
  stageTypeId: z.string().uuid(),
  sortOrder: z.number().int().min(1),
  court: z.string().min(3, 'Минимум 3 символа.'),
  caseNumber: z.string().min(5, 'Минимум 5 символов.'),
});

export const updateStageSchema = z.object({
  stageTypeId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(1).optional(),
  court: z.string().min(3).optional(),
  caseNumber: z.string().min(5).optional(),
  updatedAt: z.string({ required_error: 'updatedAt обязателен.' }),
});

// ── Hearings ──────────────────────────────────────────

const hearingTypeEnum = z.enum(['hearing', 'adj', 'result', 'note']);

export const createHearingSchema = z
  .object({
    type: hearingTypeEnum,
    datetime: z.string(),
    result: finalResultEnum.optional(),
    appealed: z.boolean().optional(),
    newDatetime: z.string().optional(),
    adjReason: z.string().max(200).optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.type !== 'result' || d.result !== undefined, {
    message: 'result обязателен для type=result.',
    path: ['result'],
  })
  .refine((d) => d.type !== 'adj' || d.newDatetime !== undefined, {
    message: 'newDatetime обязателен для type=adj.',
    path: ['newDatetime'],
  })
  .refine((d) => d.type === 'result' || d.appealed === undefined, {
    message: 'appealed допустим только для type=result.',
    path: ['appealed'],
  });

export const updateHearingSchema = z
  .object({
    type: hearingTypeEnum.optional(),
    datetime: z.string().optional(),
    result: finalResultEnum.nullable().optional(),
    appealed: z.boolean().nullable().optional(),
    newDatetime: z.string().nullable().optional(),
    adjReason: z.string().max(200).nullable().optional(),
    notes: z.string().nullable().optional(),
    updatedAt: z.string({ required_error: 'updatedAt обязателен.' }),
  });

// ── Transfers ─────────────────────────────────────────

export const createTransferSchema = z.object({
  caseId: z.string().uuid(),
  toId: z.string().uuid(),
  comment: z.string().optional(),
});

// ── Generic ───────────────────────────────────────────

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    throw AppError.badRequest('Ошибка валидации.', details);
  }
  return result.data;
}
