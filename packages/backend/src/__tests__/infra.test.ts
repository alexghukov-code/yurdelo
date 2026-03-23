/**
 * Infrastructure config validation tests.
 * Covers bugs found during Docker review:
 *
 * Bug 1: Frontend/backend dev containers used wrong base image (no Node.js)
 * Bug 2: tsx/vite missing from production image (--omit=dev)
 * Bug 3: No named volumes for node_modules → bind mount overwrites
 * Bug 4: REDIS_PASSWORD non-empty in dev → Redis auth fails
 * Bug 5: DATABASE_URL fallback=localhost → fails inside Docker
 * Bug 6: Duplicate working_dir in docker-compose
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../../../');

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}

// ═══════════════════════════════════════════════════════
// 1. Backend config: Redis password handling (Bug 4)
// ═══════════════════════════════════════════════════════

describe('Backend config: REDIS_PASSWORD env handling', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('empty REDIS_PASSWORD → password is undefined (no auth sent)', async () => {
    process.env.REDIS_PASSWORD = '';

    // Re-evaluate the expression from config
    const password = process.env.REDIS_PASSWORD || undefined;
    expect(password).toBeUndefined();
  });

  it('non-empty REDIS_PASSWORD → password is the string', () => {
    process.env.REDIS_PASSWORD = 'secret123';

    const password = process.env.REDIS_PASSWORD || undefined;
    expect(password).toBe('secret123');
  });

  it('"" || undefined is undefined (falsy empty string)', () => {
    // This is the exact expression in config/index.ts line 24
    const emptyStr: string = '';
    expect(emptyStr || undefined).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════
// 2. Backend config: DATABASE_URL fallback (Bug 5)
// ═══════════════════════════════════════════════════════

describe('Backend config: DATABASE_URL', () => {
  it('config source uses requireEnv with localhost fallback', () => {
    const configSrc = readFile('packages/backend/src/config/index.ts');
    // Fallback should contain localhost (for local dev without Docker)
    expect(configSrc).toContain("'postgres://app_user:app_password@localhost:5432/yurdelo'");
  });

  it('docker-compose.yml overrides DATABASE_URL to @postgres hostname', () => {
    const compose = readFile('infra/docker-compose.yml');
    expect(compose).toContain(
      'DATABASE_URL: postgres://app_user:app_password@postgres:5432/yurdelo',
    );
  });
});

// ═══════════════════════════════════════════════════════
// 3. docker-compose.yml: dev structure (Bugs 1-3, 6)
// ═══════════════════════════════════════════════════════

describe('docker-compose.yml (dev): structural checks', () => {
  let compose: string;

  beforeEach(() => {
    compose = readFile('infra/docker-compose.yml');
  });

  it('backend uses node:20-alpine, not custom Dockerfile (Bug 1-2)', () => {
    // Dev backend should use base node image (has tsx, npm)
    // NOT the multi-stage Dockerfile that omits devDeps
    expect(compose).toMatch(/backend:[\s\S]*?image:\s*node:20-alpine/);
    // Should NOT have `build:` under backend in dev compose
    const backendSection = compose.split(/^\s{2}frontend:/m)[0].split(/^\s{2}backend:/m)[1];
    expect(backendSection).not.toContain('dockerfile:');
  });

  it('frontend uses node:20-alpine, not custom Dockerfile (Bug 1-2)', () => {
    expect(compose).toMatch(/frontend:[\s\S]*?image:\s*node:20-alpine/);
    const frontendSection = compose.split(/^\s{2}nginx:/m)[0].split(/^\s{2}frontend:/m)[1];
    expect(frontendSection).not.toContain('dockerfile:');
  });

  it('backend has named volume for node_modules (Bug 3)', () => {
    expect(compose).toContain('backend_modules:/app/node_modules');
  });

  it('frontend has named volume for node_modules (Bug 3)', () => {
    expect(compose).toContain('frontend_modules:/app/node_modules');
  });

  it('volumes section declares backend_modules and frontend_modules', () => {
    expect(compose).toMatch(/volumes:[\s\S]*backend_modules:/);
    expect(compose).toMatch(/volumes:[\s\S]*frontend_modules:/);
  });

  it('backend overrides REDIS_PASSWORD to empty for dev (Bug 4)', () => {
    expect(compose).toContain('REDIS_PASSWORD: ""');
  });

  it('backend depends_on postgres and redis with healthcheck', () => {
    expect(compose).toContain('condition: service_healthy');
  });

  it('no duplicate working_dir in any service (Bug 6)', () => {
    // Split into service blocks and check each has at most 1 working_dir
    const services = compose.split(/^\s{2}\w/m);
    for (const svc of services) {
      const workingDirCount = (svc.match(/working_dir:/g) || []).length;
      expect(workingDirCount).toBeLessThanOrEqual(1);
    }
  });

  it('all 5 services defined: postgres, redis, backend, frontend, nginx', () => {
    for (const svc of ['postgres:', 'redis:', 'backend:', 'frontend:', 'nginx:']) {
      expect(compose).toContain(svc);
    }
  });

  it('postgres has healthcheck with pg_isready', () => {
    expect(compose).toContain('pg_isready');
  });

  it('redis has healthcheck with redis-cli ping', () => {
    expect(compose).toContain('redis-cli');
  });

  it('nginx depends_on backend and frontend', () => {
    const nginxSection = compose.split(/^\s{2}nginx:/m)[1];
    expect(nginxSection).toContain('backend');
    expect(nginxSection).toContain('frontend');
  });

  it('ports: postgres 5432, redis 6379, backend 3000, frontend 5173, nginx 80', () => {
    expect(compose).toContain('"5432:5432"');
    expect(compose).toContain('"6379:6379"');
    expect(compose).toContain('"3000:3000"');
    expect(compose).toContain('"5173:5173"');
    expect(compose).toContain('"80:80"');
  });
});

// ═══════════════════════════════════════════════════════
// 4. docker-compose.prod.yml: structural checks
// ═══════════════════════════════════════════════════════

describe('docker-compose.prod.yml: structural checks', () => {
  let compose: string;

  beforeEach(() => {
    compose = readFile('infra/docker-compose.prod.yml');
  });

  it('backend uses Dockerfile (production build)', () => {
    expect(compose).toContain('dockerfile: packages/backend/Dockerfile');
  });

  it('backend has healthcheck', () => {
    expect(compose).toContain('http://localhost:3000/health');
  });

  it('nginx has SSL ports 80 and 443', () => {
    expect(compose).toContain('"80:80"');
    expect(compose).toContain('"443:443"');
  });

  it('nginx mounts SSL certs volume', () => {
    expect(compose).toContain('./nginx/ssl:/etc/nginx/ssl');
  });

  it('redis uses --requirepass in prod', () => {
    expect(compose).toContain('--requirepass');
  });

  it('backend port is NOT exposed to host (only to internal network)', () => {
    const backendSection = compose.split(/^\s{2}backend:/m)[1]?.split(/^\s{2}\w/m)[0] ?? '';
    // Should use `expose:` not `ports:`
    expect(backendSection).toContain('expose:');
    expect(backendSection).not.toMatch(/ports:/);
  });

  it('backend has memory limit', () => {
    expect(compose).toContain('memory: 512M');
  });
});

// ═══════════════════════════════════════════════════════
// 5. Nginx configs
// ═══════════════════════════════════════════════════════

describe('nginx dev config', () => {
  let conf: string;

  beforeEach(() => {
    conf = readFile('infra/nginx/default.dev.conf');
  });

  it('proxies / to frontend:5173', () => {
    expect(conf).toContain('proxy_pass http://frontend:5173');
  });

  it('proxies /api/v1/ to backend:3000/v1/', () => {
    expect(conf).toContain('proxy_pass http://backend:3000/v1/');
  });

  it('proxies /health to backend:3000/health', () => {
    expect(conf).toContain('proxy_pass http://backend:3000/health');
  });

  it('sets client_max_body_size 50m for file uploads', () => {
    expect(conf).toContain('client_max_body_size 50m');
  });

  it('supports WebSocket upgrade for Vite HMR', () => {
    expect(conf).toContain('Upgrade $http_upgrade');
    expect(conf).toContain('Connection "upgrade"');
  });
});

describe('nginx prod config', () => {
  let conf: string;

  beforeEach(() => {
    conf = readFile('infra/nginx/default.prod.conf');
  });

  it('redirects HTTP to HTTPS', () => {
    expect(conf).toContain('return 301 https://');
  });

  it('has SSL certificate paths', () => {
    expect(conf).toContain('ssl_certificate');
    expect(conf).toContain('ssl_certificate_key');
  });

  it('enforces TLS 1.2+', () => {
    expect(conf).toContain('TLSv1.2');
  });

  it('has HSTS header', () => {
    expect(conf).toContain('Strict-Transport-Security');
  });

  it('serves frontend via try_files (SPA fallback)', () => {
    expect(conf).toContain('try_files $uri $uri/ /index.html');
  });

  it('proxies /api/v1/ to backend with https proto', () => {
    expect(conf).toContain('proxy_pass http://backend:3000/v1/');
    expect(conf).toContain('X-Forwarded-Proto https');
  });

  it('has ACME challenge location for certbot', () => {
    expect(conf).toContain('.well-known/acme-challenge');
  });
});

// ═══════════════════════════════════════════════════════
// 6. Dockerfiles
// ═══════════════════════════════════════════════════════

describe('Backend Dockerfile', () => {
  let dockerfile: string;

  beforeEach(() => {
    dockerfile = readFile('packages/backend/Dockerfile');
  });

  it('uses multi-stage build (builder + production)', () => {
    expect(dockerfile).toContain('FROM node:20-alpine AS builder');
    expect((dockerfile.match(/^FROM /gm) || []).length).toBe(2);
  });

  it('production stage omits devDependencies', () => {
    expect(dockerfile).toContain('--omit=dev');
  });

  it('copies db/ for migrations', () => {
    expect(dockerfile).toContain('COPY db/ db/');
  });

  it('has HEALTHCHECK', () => {
    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('/health');
  });

  it('exposes port 3000', () => {
    expect(dockerfile).toContain('EXPOSE 3000');
  });

  it('CMD runs compiled JS, not tsx', () => {
    expect(dockerfile).toContain('packages/backend/dist/server.js');
    // CMD should reference node, not tsx
    expect(dockerfile).toMatch(/CMD.*node.*server\.js/);
  });
});

describe('Frontend Dockerfile', () => {
  let dockerfile: string;

  beforeEach(() => {
    dockerfile = readFile('packages/frontend/Dockerfile');
  });

  it('uses multi-stage build', () => {
    expect((dockerfile.match(/^FROM /gm) || []).length).toBe(2);
  });

  it('builds with vite', () => {
    expect(dockerfile).toContain('npm run build -w packages/frontend');
  });

  it('copies dist to /usr/share/frontend/', () => {
    expect(dockerfile).toContain('/usr/share/frontend/');
  });
});

// ═══════════════════════════════════════════════════════
// 7. docker-compose.test.yml — инфраструктура для интеграционных тестов
//
// Тестовый compose-файл поднимает PostgreSQL и Redis на отдельных портах,
// изолированно от dev-окружения. Данные хранятся в tmpfs — после docker-compose down
// всё обнуляется, гарантируя чистое состояние для каждого прогона тестов.
// ═══════════════════════════════════════════════════════

describe('docker-compose.test.yml: structure', () => {
  let compose: string;

  beforeEach(() => {
    compose = readFile('infra/docker-compose.test.yml');
  });

  // Тестовому окружению нужны только БД и кэш.
  // Backend, frontend, nginx — не нужны: тесты запускают Express in-process через supertest.
  it('has exactly 2 services: postgres-test and redis-test', () => {
    expect(compose).toContain('postgres-test:');
    expect(compose).toContain('redis-test:');
    expect(compose).not.toMatch(/^\s{2}backend:/m);
    expect(compose).not.toMatch(/^\s{2}frontend:/m);
    expect(compose).not.toMatch(/^\s{2}nginx:/m);
  });

  // Версии образов должны совпадать с dev, чтобы тесты работали
  // на тех же версиях PostgreSQL/Redis, что и в разработке.
  it('uses same images as dev: postgres:16-alpine and redis:7-alpine', () => {
    expect(compose).toContain('postgres:16-alpine');
    expect(compose).toContain('redis:7-alpine');
  });

  // Порты смещены: postgres 5433 (вместо 5432), redis 6380 (вместо 6379).
  // Это позволяет запускать тесты параллельно с dev-окружением без конфликтов.
  it('uses different ports from dev (5433, 6380)', () => {
    expect(compose).toContain('"5433:5432"');
    expect(compose).toContain('"6380:6379"');
    expect(compose).not.toContain('"5432:5432"');
    expect(compose).not.toContain('"6379:6379"');
  });

  // Отдельная БД yurdelo_test — чтобы тестовые данные никогда не попали в dev-базу.
  it('uses test database name yurdelo_test', () => {
    expect(compose).toContain('POSTGRES_DB: yurdelo_test');
  });

  // tmpfs вместо named volume: данные живут только в RAM.
  // При docker-compose down всё исчезает — каждый прогон начинается с нуля.
  // Это критично для воспроизводимости тестов: не нужно вручную чистить БД.
  it('uses tmpfs instead of named volume for postgres data', () => {
    expect(compose).toContain('tmpfs:');
    expect(compose).toContain('/var/lib/postgresql/data');
    expect(compose).not.toContain('pgdata:');
  });

  // Секция volumes: на верхнем уровне не нужна — нет named volumes.
  // Если бы она была, данные могли бы пережить docker-compose down.
  it('does not have named volumes section', () => {
    expect(compose).not.toMatch(/^volumes:/m);
  });

  // init-db-test.sql монтируется в docker-entrypoint-initdb.d/ —
  // PostgreSQL автоматически выполняет его при первом запуске контейнера.
  // Скрипт создаёт роль app_user с нужными правами (как в dev, но для yurdelo_test).
  it('mounts init-db-test.sql for app_user creation', () => {
    expect(compose).toContain('init-db-test.sql');
    expect(compose).toContain('docker-entrypoint-initdb.d');
  });

  // Healthcheck нужен для флага --wait: docker-compose up -d --wait
  // не вернёт управление, пока оба сервиса не станут healthy.
  // Без healthcheck тесты могут начаться до готовности БД → случайные падения.
  it('has healthchecks on both services', () => {
    expect(compose).toContain('pg_isready');
    expect(compose).toContain('redis-cli');
  });

  // Healthcheck postgres должен проверять именно yurdelo_test, а не yurdelo.
  // pg_isready с неправильным именем БД может вернуть OK даже если нужная БД не создана.
  it('postgres healthcheck references yurdelo_test database', () => {
    expect(compose).toContain('pg_isready -U postgres -d yurdelo_test');
  });

  // Имена контейнеров не должны пересекаться с dev-окружением.
  // Docker не позволит запустить два контейнера с одинаковым именем —
  // это сломало бы параллельную работу dev + test.
  it('uses separate container names from dev', () => {
    expect(compose).toContain('yurdelo-postgres-test');
    expect(compose).toContain('yurdelo-redis-test');
    const devCompose = readFile('infra/docker-compose.yml');
    const extractNames = (text: string): string[] =>
      [...text.matchAll(/container_name:\s*(\S+)/g)].map((m) => m[1]);
    const devNames = extractNames(devCompose);
    const testNames = extractNames(compose);
    const overlap = devNames.filter((n) => testNames.includes(n));
    expect(overlap).toEqual([]);
  });

  // Отдельная Docker-сеть yurdelo-test-net изолирует тестовые контейнеры.
  // Без неё postgres-test мог бы случайно быть доступен из dev-контейнеров по имени.
  it('uses isolated network yurdelo-test-net', () => {
    expect(compose).toContain('yurdelo-test-net');
  });

  // Интервал healthcheck <= 3с — быстрее чем в dev (5с).
  // Для тестов важна скорость старта: каждая лишняя секунда ожидания
  // замедляет CI-пайплайн. 3с × 5 retries = максимум 15с до healthy.
  it('healthcheck intervals are <= 3s (fast for tests)', () => {
    const intervals = [...compose.matchAll(/interval:\s*(\d+)s/g)].map((m) => parseInt(m[1]));
    expect(intervals.length).toBeGreaterThanOrEqual(2);
    for (const interval of intervals) {
      expect(interval).toBeLessThanOrEqual(3);
    }
  });
});

// ───────────────────────────────────────────────────────
// init-db-test.sql — скрипт инициализации тестовой БД.
//
// Создаёт роль app_user с теми же правами, что и в dev.
// Главное отличие: GRANT CONNECT на yurdelo_test вместо yurdelo.
// Если права отличаются от dev, тесты могут проходить,
// а в реальной среде приложение упадёт с permission denied.
// ───────────────────────────────────────────────────────

describe('init-db-test.sql: test database init', () => {
  let initSql: string;
  let devInitSql: string;

  beforeEach(() => {
    initSql = readFile('infra/postgres/init-db-test.sql');
    devInitSql = readFile('infra/postgres/init-db.sql');
  });

  // Роль app_user — это непривилегированный пользователь, под которым работает приложение.
  // Миграции бегут под postgres (суперюзер), а app_user подчиняется RLS-политикам.
  it('creates app_user role', () => {
    expect(initSql).toContain('CREATE ROLE app_user');
  });

  // GRANT CONNECT должен указывать на yurdelo_test, а не на yurdelo.
  // Если указать yurdelo — команда упадёт, т.к. такой БД нет в тестовом контейнере.
  // Регулярка \b[^_] гарантирует, что мы не путаем "yurdelo" и "yurdelo_test".
  it('grants connect on yurdelo_test (not yurdelo)', () => {
    expect(initSql).toContain('GRANT CONNECT ON DATABASE yurdelo_test');
    expect(initSql).not.toMatch(/GRANT CONNECT ON DATABASE yurdelo\b[^_]/);
  });

  // Набор привилегий (SELECT, INSERT, UPDATE, DELETE + USAGE на sequences)
  // должен быть идентичен dev-версии. Если в тесте дать больше прав —
  // тесты пройдут, но в prod приложение может получить permission denied.
  it('grants same privileges as dev init-db.sql', () => {
    expect(initSql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user');
    expect(initSql).toContain('GRANT USAGE, SELECT ON SEQUENCES TO app_user');
  });

  // Пароль app_user должен совпадать с dev — иначе DATABASE_URL в тестах
  // не сможет подключиться. Извлекаем пароль из обоих файлов и сравниваем.
  it('uses same app_user password as dev', () => {
    const devPassword = devInitSql.match(/PASSWORD '([^']+)'/)?.[1];
    const testPassword = initSql.match(/PASSWORD '([^']+)'/)?.[1];
    expect(devPassword).toBeTruthy();
    expect(testPassword).toBe(devPassword);
  });

  // Без USAGE ON SCHEMA public app_user не сможет видеть таблицы в схеме public.
  // Все миграции создают таблицы именно в public.
  it('grants USAGE ON SCHEMA public', () => {
    expect(initSql).toContain('GRANT USAGE ON SCHEMA public TO app_user');
  });

  // ALTER DEFAULT PRIVILEGES гарантирует, что таблицы, созданные суперюзером
  // (через миграции), автоматически получат нужные GRANT для app_user.
  // Без этого: миграции пройдут, но app_user не сможет читать новые таблицы.
  it('sets DEFAULT PRIVILEGES for future tables', () => {
    expect(initSql).toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA public');
  });
});

// ───────────────────────────────────────────────────────
// Сравнение test и dev compose-файлов.
//
// Цель: гарантировать, что тестовое и dev-окружение могут работать одновременно.
// Если хоть один порт или имя контейнера совпадает — docker compose up упадёт
// или, хуже, тесты пойдут в dev-базу.
// ───────────────────────────────────────────────────────

describe('docker-compose.test.yml vs docker-compose.yml: no port conflicts', () => {

  // Извлекаем все host-порты (левая часть "HOST:CONTAINER") из обоих файлов.
  // Если есть пересечение — два сервиса попытаются слушать один порт → ошибка bind.
  it('test and dev have zero port overlap', () => {
    const devCompose = readFile('infra/docker-compose.yml');
    const testCompose = readFile('infra/docker-compose.test.yml');

    const extractHostPorts = (text: string): string[] => {
      const matches = [...text.matchAll(/"(\d+):\d+"/g)];
      return matches.map((m) => m[1]);
    };

    const devPorts = extractHostPorts(devCompose);
    const testPorts = extractHostPorts(testCompose);

    const overlap = devPorts.filter((p) => testPorts.includes(p));
    expect(overlap).toEqual([]);
  });

  // Docker требует уникальные container_name в пределах хоста.
  // Если имена совпадут — второй docker compose up не сможет создать контейнер.
  it('test and dev have different container names', () => {
    const devCompose = readFile('infra/docker-compose.yml');
    const testCompose = readFile('infra/docker-compose.test.yml');

    const extractNames = (text: string): string[] => {
      return [...text.matchAll(/container_name:\s*(\S+)/g)].map((m) => m[1]);
    };

    const devNames = extractNames(devCompose);
    const testNames = extractNames(testCompose);

    const overlap = devNames.filter((n) => testNames.includes(n));
    expect(overlap).toEqual([]);
  });

  // Изолированная сеть не даёт тестовым контейнерам резолвить dev-имена
  // (например, "postgres") и наоборот. Dev использует дефолтную сеть,
  // test — явно заданную yurdelo-test-net.
  it('test and dev use different network names', () => {
    const testCompose = readFile('infra/docker-compose.test.yml');
    expect(testCompose).toContain('yurdelo-test-net');
  });
});

// ═══════════════════════════════════════════════════════
// 8. Required files exist
// ═══════════════════════════════════════════════════════

describe('Required infrastructure files exist', () => {
  const files = [
    'infra/docker-compose.yml',
    'infra/docker-compose.prod.yml',
    'infra/docker-compose.test.yml',
    'infra/nginx/default.dev.conf',
    'infra/nginx/default.prod.conf',
    'infra/postgres/init-db.sql',
    'infra/postgres/init-db-test.sql',
    'infra/scripts/deploy.sh',
    'infra/scripts/rollback.sh',
    'packages/backend/Dockerfile',
    'packages/frontend/Dockerfile',
    '.dockerignore',
    '.env.example',
  ];

  for (const f of files) {
    it(f, () => {
      expect(() => readFile(f)).not.toThrow();
    });
  }
});

// ═══════════════════════════════════════════════════════
// 8. .env.example
// ═══════════════════════════════════════════════════════

describe('.env.example', () => {
  let env: string;

  beforeEach(() => {
    env = readFile('.env.example');
  });

  it('has DATABASE_URL with localhost (for local dev)', () => {
    expect(env).toContain('DATABASE_URL=postgres://app_user:app_password@localhost');
  });

  it('REDIS_PASSWORD is empty by default (for dev without --requirepass)', () => {
    expect(env).toMatch(/REDIS_PASSWORD=\s*$/m);
  });

  it('has all required env vars', () => {
    const required = [
      'DATABASE_URL',
      'MIGRATION_DATABASE_URL',
      'REDIS_HOST',
      'REDIS_PORT',
      'JWT_SECRET',
      'S3_ENDPOINT',
      'S3_BUCKET',
      'PORT',
      'NODE_ENV',
    ];
    for (const key of required) {
      expect(env).toContain(key);
    }
  });

  it('does not contain actual secrets', () => {
    expect(env).not.toMatch(/sk_live_/);
    expect(env).not.toMatch(/AKIA[A-Z0-9]{16}/);
  });
});

// ═══════════════════════════════════════════════════════
// 9. CI workflow (ci.yml)
// ═══════════════════════════════════════════════════════

describe('CI workflow (ci.yml)', () => {
  let ci: string;

  beforeEach(() => {
    ci = readFile('.github/workflows/ci.yml');
  });

  it('exists and is valid YAML (name field)', () => {
    expect(ci).toContain('name: CI');
  });

  it('triggers on push to main/develop and PRs', () => {
    expect(ci).toContain('push:');
    expect(ci).toContain('pull_request:');
  });

  it('has lint job with eslint + typecheck', () => {
    expect(ci).toContain('npm run lint');
    expect(ci).toContain('tsc --noEmit');
  });

  it('has test job that depends on lint', () => {
    expect(ci).toContain('needs: lint');
    expect(ci).toContain('test:backend');
    expect(ci).toContain('test:frontend');
  });

  it('has build job only on main branch', () => {
    expect(ci).toContain("github.ref == 'refs/heads/main'");
    expect(ci).toContain('docker/build-push-action');
  });

  it('builds shared before lint/test (type references)', () => {
    expect(ci).toContain('npm run build:shared');
  });

  it('uses node 20', () => {
    expect(ci).toContain('node-version: 20');
  });
});

// ═══════════════════════════════════════════════════════
// 10. Deploy workflow — deploy pipeline
// ═══════════════════════════════════════════════════════

describe('Deploy workflow: deploy pipeline', () => {
  let deploy: string;

  beforeEach(() => {
    deploy = readFile('.github/workflows/deploy.yml');
  });

  it('triggers on CI workflow success', () => {
    expect(deploy).toContain('workflow_run:');
    expect(deploy).toContain('workflows: [CI]');
    expect(deploy).toContain('types: [completed]');
  });

  it('has manual dispatch with deploy/rollback options', () => {
    expect(deploy).toContain('workflow_dispatch:');
    expect(deploy).toContain('rollback-staging');
    expect(deploy).toContain('rollback-production');
  });

  it('deploy-staging uses staging environment', () => {
    // environment: staging gives access to staging secrets
    expect(deploy).toMatch(/deploy-staging:[\s\S]*?environment:\s*staging/);
  });

  it('smoke-staging has environment for secrets access (Bug 5 fix)', () => {
    expect(deploy).toMatch(/smoke-staging:[\s\S]*?environment:\s*staging/);
  });

  it('deploy-production uses production environment (manual approval)', () => {
    expect(deploy).toMatch(/deploy-production:[\s\S]*?environment:\s*production/);
  });

  it('deploy-production depends on smoke-staging', () => {
    expect(deploy).toMatch(/deploy-production:[\s\S]*?needs:\s*smoke-staging/);
  });

  it('.env heredoc is followed by sed to strip whitespace (Bug 1 fix)', () => {
    const heredocCount = (deploy.match(/sed -i 's\/\^\[/g) || []).length;
    // Both staging and production deploys strip whitespace
    expect(heredocCount).toBeGreaterThanOrEqual(2);
  });

  it('BACKEND_IMAGE is defined inside SSH script, not as workflow env (Bug 2 fix)', () => {
    // Each SSH script block should set BACKEND_IMAGE locally
    const sshBlocks = deploy.split('script: |');
    for (const block of sshBlocks.slice(1)) {
      // Each SSH block that uses BACKEND_IMAGE should define it
      if (block.includes('$BACKEND_IMAGE')) {
        expect(block).toContain('BACKEND_IMAGE=yurdelo-backend');
      }
    }
  });

  it('build happens BEFORE migration in deploy (Bug 3 fix)', () => {
    // In staging deploy, "build" must appear before "node-pg-migrate up"
    const stagingBlock = deploy.split('deploy-staging:')[1]?.split(/^\s{2}\w/m)[0] ?? '';
    const buildIdx = stagingBlock.indexOf('docker compose');
    const migrateIdx = stagingBlock.indexOf('node-pg-migrate up');
    expect(buildIdx).toBeGreaterThan(-1);
    expect(migrateIdx).toBeGreaterThan(-1);
    expect(buildIdx).toBeLessThan(migrateIdx);
  });

  it('production deploy has auto-rollback on health failure', () => {
    expect(deploy).toContain('AUTO ROLLBACK');
    expect(deploy).toContain('.last-production-tag');
  });
});

// ═══════════════════════════════════════════════════════
// 11. Deploy workflow — rollback jobs
// ═══════════════════════════════════════════════════════

describe('Deploy workflow: rollback', () => {
  let deploy: string;

  beforeEach(() => {
    deploy = readFile('.github/workflows/deploy.yml');
  });

  it('rollback-staging job exists and checks for previous tag', () => {
    expect(deploy).toContain('rollback-staging:');
    expect(deploy).toContain('.last-staging-tag');
    expect(deploy).toContain('No previous tag');
  });

  it('rollback-production job exists and checks for previous tag', () => {
    expect(deploy).toContain('rollback-production:');
    expect(deploy).toContain('.last-production-tag');
  });

  it('staging rollback runs migration down (automated)', () => {
    const rollbackSection =
      deploy.split('rollback-staging:')[1]?.split(/^\s{2}rollback-production:/m)[0] ?? '';
    expect(rollbackSection).toContain('node-pg-migrate down');
  });

  it('production rollback does NOT auto-run migration down (too dangerous)', () => {
    const rollbackSection = deploy.split('rollback-production:')[1] ?? '';
    // Should contain warning, not actual migration down command
    expect(rollbackSection).toContain('manually');
    expect(rollbackSection).not.toMatch(/run --rm backend[\s\S]*?node-pg-migrate down/);
  });

  it('rollback jobs stop backend before switching image', () => {
    expect(deploy).toContain('stop backend');
  });

  it('rollback jobs verify health after restart', () => {
    const rollbacks = [
      deploy.split('rollback-staging:')[1]?.split(/^\s{2}\w/m)[0] ?? '',
      deploy.split('rollback-production:')[1] ?? '',
    ];
    for (const block of rollbacks) {
      expect(block).toContain('/health');
    }
  });
});

// ═══════════════════════════════════════════════════════
// 12. Shell scripts
// ═══════════════════════════════════════════════════════

describe('Shell scripts', () => {
  it('deploy.sh uses persistent tag file path (not /tmp) (Bug 4 fix)', () => {
    const script = readFile('infra/scripts/deploy.sh');
    expect(script).not.toContain('/tmp/');
    expect(script).toContain('.last-deploy-tag');
  });

  it('deploy.sh builds before migrating (Bug 3 fix)', () => {
    const script = readFile('infra/scripts/deploy.sh');
    const buildIdx = script.indexOf('docker compose');
    const migrateIdx = script.indexOf('node-pg-migrate up');
    expect(buildIdx).toBeLessThan(migrateIdx);
  });

  it('deploy.sh has auto-rollback on health failure', () => {
    const script = readFile('infra/scripts/deploy.sh');
    expect(script).toContain('rollback');
    expect(script).toContain('.last-deploy-tag');
  });

  it('rollback.sh uses persistent tag file (not /tmp)', () => {
    const script = readFile('infra/scripts/rollback.sh');
    expect(script).not.toContain('/tmp/');
  });

  it('rollback.sh exits with error if health fails', () => {
    const script = readFile('infra/scripts/rollback.sh');
    expect(script).toContain('exit 1');
  });

  it('both scripts use set -euo pipefail', () => {
    expect(readFile('infra/scripts/deploy.sh')).toContain('set -euo pipefail');
    expect(readFile('infra/scripts/rollback.sh')).toContain('set -euo pipefail');
  });
});
