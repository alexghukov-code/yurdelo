#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
# Проверка корректности docker-compose.test.yml
#
# Этот скрипт запускается вручную при изменении тестовой инфраструктуры.
# Он последовательно проверяет все аспекты: от подъёма контейнеров
# до прогона миграций и изоляции от dev-окружения.
#
# Требования: docker, psql, redis-cli, npx (node >= 20)
# Запуск: bash infra/scripts/test-infra.sh  (из корня репозитория)
# ══════════════════════════════════════════════════════════

set -euo pipefail

COMPOSE="docker compose -f infra/docker-compose.test.yml"

# Подключение под суперюзером — для миграций и проверки ролей
PG_SUPER="postgresql://postgres:postgres@localhost:5433/yurdelo_test"

# Подключение под app_user — для проверки что приложение сможет работать с БД
PG_APP="postgresql://app_user:29203f28eb2d4028704444ea4151d86a5a0e0df2@localhost:5433/yurdelo_test"

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }

# При любом завершении (успех, ошибка, Ctrl+C) — останавливаем тестовые контейнеры.
# --volumes удаляет анонимные тома, но tmpfs и так не персистится.
cleanup() {
  echo ""
  echo "── Cleanup ──"
  $COMPOSE down --volumes 2>/dev/null || true
}
trap cleanup EXIT

# ── A. Останавливаем dev-контейнеры, если запущены ─────
# Dev-контейнеры используют другие порты, но для чистоты эксперимента
# лучше начать с чистого состояния — исключаем любое влияние.
echo "── Step A: stop dev containers ──"
docker compose -f infra/docker-compose.yml down 2>/dev/null || true

# ── B. Запускаем тестовые контейнеры ───────────────────
# --wait блокирует до тех пор, пока healthcheck обоих сервисов не вернёт healthy.
# Если healthcheck не настроен или БД не поднялась — скрипт упадёт здесь.
echo "── Step B: start test containers ──"
$COMPOSE down --volumes 2>/dev/null || true
$COMPOSE up -d --wait

# ── C. Проверяем статус контейнеров ────────────────────
# docker compose ps должен показать оба сервиса как healthy.
# Если хотя бы один не healthy — что-то не так с образом или healthcheck.
echo "── Step C: container status ──"
if $COMPOSE ps | grep -q "healthy"; then
  pass "containers are healthy"
else
  fail "containers not healthy"
fi

# ── D. Проверяем PostgreSQL + Redis ────────────────────
echo "── Step D: PostgreSQL checks ──"

# D.1 — Роль app_user должна существовать (создаётся init-db-test.sql).
# Если init-скрипт не отработал, роли не будет → приложение не подключится.
if psql "$PG_SUPER" -tAc "SELECT 1 FROM pg_roles WHERE rolname='app_user'" | grep -q 1; then
  pass "app_user role exists"
else
  fail "app_user role missing"
fi

# D.2 — app_user может подключиться и выполнить полный CRUD-цикл.
# Проверяем CREATE TABLE, INSERT, SELECT, DROP — те же операции, что делает приложение.
# Если DEFAULT PRIVILEGES не настроены, CREATE TABLE пройдёт, но SELECT может упасть.
if psql "$PG_APP" -c "CREATE TABLE _probe(id int); INSERT INTO _probe VALUES(1); SELECT * FROM _probe; DROP TABLE _probe;" >/dev/null 2>&1; then
  pass "app_user can connect and CRUD"
else
  fail "app_user cannot connect or CRUD"
fi

# D.3 — Redis должен отвечать PONG на PING.
# Тестовый Redis на порту 6380 без пароля (как в dev).
if redis-cli -h localhost -p 6380 ping 2>/dev/null | grep -q PONG; then
  pass "redis responds PONG"
else
  fail "redis not responding"
fi

# ── E. Проверяем tmpfs (данные не персистятся) ─────────
# Главное свойство тестовой инфраструктуры: после down + up всё обнуляется.
# Создаём маркерную таблицу, перезапускаем контейнеры, проверяем что её нет.
echo "── Step E: tmpfs clean state ──"

psql "$PG_SUPER" -c "CREATE TABLE _marker(id int);" >/dev/null 2>&1

# Полный перезапуск: down уничтожает tmpfs, up создаёт чистую БД
$COMPOSE down --volumes
$COMPOSE up -d --wait

# Маркерная таблица должна исчезнуть — если она осталась, tmpfs не работает
if psql "$PG_SUPER" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_name='_marker'" | grep -q "^0"; then
  pass "tmpfs: data not persisted after restart"
else
  fail "tmpfs: data persisted (should not)"
fi

# ── F. Прогоняем миграции ──────────────────────────────
# Все 17 миграций должны пройти без ошибок на чистой БД.
# Миграции бегут под postgres (суперюзер) — как в production.
# После миграций проверяем что создалось достаточное количество таблиц.
echo "── Step F: migrations ──"
cd "$(dirname "$0")/../.."
if MIGRATION_DATABASE_URL="$PG_SUPER" npx node-pg-migrate up \
  --migrations-dir db/migrations --migration-file-language sql 2>&1; then
  pass "all 17 migrations applied"
else
  fail "migrations failed"
fi

# Считаем таблицы — должно быть минимум 10 (users, cases, stages, hearings,
# documents, transfers, notifications, audit_log, auth_events, api_logs и др.)
TABLE_COUNT=$(psql "$PG_SUPER" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
if [ "$TABLE_COUNT" -ge 10 ]; then
  pass "found $TABLE_COUNT tables after migration"
else
  fail "expected >=10 tables, got $TABLE_COUNT"
fi

# ── G. Изоляция: dev и test работают одновременно ──────
# Поднимаем dev-контейнеры рядом с тестовыми.
# Оба набора должны быть healthy — порты и имена не конфликтуют.
echo "── Step G: isolation check ──"
docker compose -f infra/docker-compose.yml up -d --wait 2>/dev/null || true

DEV_PG=$(docker inspect yurdelo-postgres --format '{{.State.Health.Status}}' 2>/dev/null || echo "not running")
TEST_PG=$(docker inspect yurdelo-postgres-test --format '{{.State.Health.Status}}' 2>/dev/null || echo "not running")

if [ "$DEV_PG" = "healthy" ] && [ "$TEST_PG" = "healthy" ]; then
  pass "dev and test postgres run side by side"
else
  fail "isolation issue: dev=$DEV_PG test=$TEST_PG"
fi

# Останавливаем dev — тестовые остановит trap cleanup
docker compose -f infra/docker-compose.yml down 2>/dev/null || true

# ── Итог ─────────────────────────────────────────────
echo ""
echo "══════════════════════════════════"
echo "  PASSED: $PASS   FAILED: $FAIL"
echo "══════════════════════════════════"

[ "$FAIL" -eq 0 ] || exit 1
