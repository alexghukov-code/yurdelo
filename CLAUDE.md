# ЮрДело — Система управления адвокатской практикой

## Quick start
```bash
npm install
npm run docker:up          # PostgreSQL + Redis
cp .env.example .env       # настроить переменные
npm run db:migrate          # миграции
npm run dev:backend         # http://localhost:3000
npm run dev:frontend        # http://localhost:5173
```

## Stack
- **Monorepo**: npm workspaces (packages/shared, packages/backend, packages/frontend)
- **Backend**: Node.js 20, Express 5, PostgreSQL 16, Redis 7
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Migrations**: node-pg-migrate (db/migrations/)
- **Tests**: Vitest (backend), Vitest (frontend)

## Commands
- `npm run lint` — ESLint
- `npm run format` — Prettier
- `npm run typecheck` — TypeScript check all packages
- `npm run test` — run backend tests
- `npm run db:migrate` — apply migrations
- `npm run db:rollback` — rollback last migration
- `npm run docker:up / docker:down` — local infra

## Conventions
- All dates stored as UTC (TIMESTAMPTZ)
- Soft delete via `deleted_at` column
- Optimistic locking via `updated_at`
- API responses: `{ data, meta }` or `{ error: { code, message, details } }`
- RLS enforced at DB level; backend sets `app.current_user_id` and `app.current_user_role` per request
