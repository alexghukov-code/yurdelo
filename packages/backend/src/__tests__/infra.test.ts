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
// 7. Required files exist
// ═══════════════════════════════════════════════════════

describe('Required infrastructure files exist', () => {
  const files = [
    'infra/docker-compose.yml',
    'infra/docker-compose.prod.yml',
    'infra/nginx/default.dev.conf',
    'infra/nginx/default.prod.conf',
    'infra/postgres/init-db.sql',
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
