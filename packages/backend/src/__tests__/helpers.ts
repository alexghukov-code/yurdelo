import { vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { createApp } from '../app.js';
import { signAccessToken } from '../utils/jwt.js';

// Pre-computed hash for "Password1" (cost 4 — fast for tests)
const TEST_PASSWORD = 'Password1';
const TEST_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

export { TEST_PASSWORD, TEST_HASH };

export const USERS = {
  admin: {
    id: 'a0000000-0000-0000-0000-000000000001',
    email: 'admin@test.ru',
    password_hash: TEST_HASH,
    role: 'admin',
    status: 'active',
    first_name: 'Алексей',
    last_name: 'Иванов',
    middle_name: 'Петрович',
    phone: null,
    two_fa_enabled: false,
    two_fa_secret: null,
    created_at: new Date().toISOString(),
  },
  lawyer: {
    id: 'a0000000-0000-0000-0000-000000000002',
    email: 'lawyer@test.ru',
    password_hash: TEST_HASH,
    role: 'lawyer',
    status: 'active',
    first_name: 'Мария',
    last_name: 'Петрова',
    middle_name: null,
    phone: null,
    two_fa_enabled: false,
    two_fa_secret: null,
    created_at: new Date().toISOString(),
  },
  inactive: {
    id: 'a0000000-0000-0000-0000-000000000099',
    email: 'inactive@test.ru',
    password_hash: TEST_HASH,
    role: 'lawyer',
    status: 'inactive',
    first_name: 'Деактив',
    last_name: 'Тестов',
    middle_name: null,
    phone: null,
    two_fa_enabled: false,
    two_fa_secret: null,
    created_at: new Date().toISOString(),
  },
  viewer: {
    id: 'a0000000-0000-0000-0000-000000000003',
    email: 'viewer@test.ru',
    password_hash: TEST_HASH,
    role: 'viewer',
    status: 'active',
    first_name: 'Анна',
    last_name: 'Козлова',
    middle_name: null,
    phone: null,
    two_fa_enabled: false,
    two_fa_secret: null,
    created_at: new Date().toISOString(),
  },
};

export function createMockPool() {
  const queryFn = vi.fn(async () => ({ rows: [] as any[], rowCount: 0 }));
  const clientQueryFn = vi.fn(async () => ({ rows: [] as any[], rowCount: 0 }));
  const mockClient = { query: clientQueryFn, release: vi.fn() };
  return {
    query: queryFn,
    connect: vi.fn(async () => mockClient),
    end: vi.fn(),
    on: vi.fn(),
    _client: mockClient,
  } as any;
}

export function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ..._args: unknown[]) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
      return keys.length;
    }),
    incr: vi.fn(async (key: string) => {
      const val = parseInt(store.get(key) || '0', 10) + 1;
      store.set(key, String(val));
      return val;
    }),
    expire: vi.fn(async () => 1),
    keys: vi.fn(async (pattern: string) => {
      const prefix = pattern.replace('*', '');
      return Array.from(store.keys()).filter((k) => k.startsWith(prefix));
    }),
    ping: vi.fn(async () => 'PONG'),
    connect: vi.fn(),
    disconnect: vi.fn(),
    _store: store,
  } as any;
}

export function buildTestApp() {
  const pool = createMockPool();
  const redis = createMockRedis();
  const { app } = createApp({
    db: pool, redis, emailQueue: null,
    disableRateLimit: true, disableApiLogger: true,
  });
  return { app, pool, redis };
}

const NOW = new Date().toISOString();

export const PARTIES = {
  plaintiff: { id: 'c0000000-0000-0000-0000-000000000001', name: 'ООО Альфа' },
  defendant: { id: 'c0000000-0000-0000-0000-000000000002', name: 'ИП Смирнов' },
};

export const CASES = {
  active: {
    id: 'd0000000-0000-0000-0000-000000000001',
    name: 'Взыскание задолженности',
    plt_id: PARTIES.plaintiff.id, def_id: PARTIES.defendant.id,
    plt_name: PARTIES.plaintiff.name, def_name: PARTIES.defendant.name,
    lawyer_id: USERS.lawyer.id,
    lawyer_last: USERS.lawyer.last_name, lawyer_first: USERS.lawyer.first_name,
    category: 'arbitration', status: 'active',
    final_result: null, claim_amount: 1500000,
    closed_at: null, deleted_at: null,
    created_at: NOW, updated_at: NOW,
  },
};

export const STAGES = {
  first: {
    id: 'e0000000-0000-0000-0000-000000000001',
    case_id: CASES.active.id,
    stage_type_id: 'a0000000-0000-0000-0000-000000000002',
    stage_type_name: '1-я инстанция', type_sort_order: 2,
    sort_order: 2, court: 'Арбитражный суд г. Москвы',
    case_number: 'А40-12345/2025',
    lawyer_id: USERS.lawyer.id,
    deleted_at: null, created_at: NOW, updated_at: NOW,
  },
};

export const HEARINGS = {
  scheduled: {
    id: 'f0000000-0000-0000-0000-000000000001',
    stage_id: STAGES.first.id,
    type: 'hearing', datetime: '2026-04-15T10:00:00+03:00',
    result: null, appealed: null,
    new_datetime: null, adj_reason: null, notes: null,
    lawyer_id: USERS.lawyer.id, case_id: CASES.active.id,
    deleted_at: null, created_at: NOW, updated_at: NOW,
  },
};

export function authHeader(user: { id: string; email: string; role: string }) {
  const token = signAccessToken({ sub: user.id, role: user.role, email: user.email });
  return `Bearer ${token}`;
}
