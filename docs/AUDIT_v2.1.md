# Аудит проекта ЮрДело vs ТЗ v2.1

Дата: 2026-03-17
Тестов: 350 (334 backend + 16 frontend)
Эндпоинтов: 41
Typecheck: OK

---

## 1. Что реализовано

### Backend (41 эндпоинт)

| Модуль | Эндпоинтов | Статус | Ключевые фичи |
|---|---|---|---|
| Health | 1 | done | DB + Redis check |
| Auth | 7 | done | JWT, refresh, 2FA TOTP, brute-force, bcrypt 12 |
| Users | 7 | done | CRUD, deactivate/restore (транзакция), optimistic lock, audit, user_history |
| Cases | 8 | done | CRUD, status, final-result, fulltext search, optimistic lock, audit |
| Stages | 3 | done | CRUD, sort_order warning, optimistic lock, audit |
| Hearings | 3 | done | CRUD, CHECK constraints (adj/result), document cascade, audit |
| Transfers | 3 | done | Atomic transaction, deduplicate constraint, notifications, audit |
| Documents | 3 | done | S3 upload/signed URL/soft delete, multer, retry 3x, mime validation |
| Notifications | 3 | done | List + mark read + read-all, dedup, polling |
| Reports | 4 | done | 4 отчёта x tab'ы, win_rate, стагнация >30д, calendar |

### База данных (15 миграций)

| Таблица | Миграция | RLS | Индексы |
|---|---|---|---|
| users | 002 | — | email unique partial |
| parties | 003 | 014 | — |
| stage_types | 004 | — | name unique partial |
| cases | 005 | 014 | lawyer_id, status, plt/def, GIN fulltext |
| stages | 006 | 014 | case_id |
| hearings | 007 | 014 | stage_id, datetime, type+datetime |
| documents | 008 | 014 | hearing_id, case_id |
| transfers | 009 | 014 | case_id, from/to, unique constraint |
| audit_log | 010 | — | entity, created_at (partitioned 2024-2027) |
| notifications | 011+015 | 014 | user_id+is_read |
| user_history | 012 | — | user_id |
| auth_events | 012 | — | created_at |
| api_logs | 012 | — | created_at |
| failed_notifications | 012 | — | — |

### Frontend (7 страниц)

| Страница | Реализовано |
|---|---|
| Login | email + password + 2FA |
| Dashboard | stat cards + recent cases |
| Cases list | search 300ms debounce, filters, pagination |
| Case detail | стадии + слушания + final result |
| Parties | search + create modal |
| Calendar | month grid + events |
| Notifications | bell dropdown + mark read |

### Инфраструктура

| Компонент | Статус |
|---|---|
| Docker (dev) | done — node:20-alpine, hot reload, named volumes |
| Docker (prod) | done — multi-stage build, healthcheck |
| Nginx (dev) | done — proxy vite + backend |
| Nginx (prod) | done — SSL, HSTS, SPA fallback |
| CI (GitHub Actions) | done — lint -> test -> build |
| CD (GitHub Actions) | done — staging -> smoke -> approve -> prod |
| Rollback | done — auto + manual, tag файл |
| Seeds | done — 4 типа стадий + demo data |

### Тесты: 350

| Пакет | Файлов | Тестов |
|---|---|---|
| Backend | 11 | 334 |
| Frontend | 4 | 16 |
| **Итого** | **15** | **350** |

---

## 2. Что НЕ реализовано

### Критично (блокирует прод)

| # | Требование ТЗ | Раздел ТЗ | Что отсутствует |
|---|---|---|---|
| **C1** | **Parties CRUD API** | 2.3 | Backend route `/v1/parties` не создан. Frontend и миграция есть, но API — нет. Фронт получит 404 |
| **C2** | **Rate limiting** | 1.3.3 | Middleware отсутствует. ТЗ: `/auth/login` 10/мин, все API 100/мин, upload 10/мин, burst 20/сек |
| **C3** | **RLS middleware** (set_config per request) | 3.2 | RLS policies в БД есть, но Express middleware НЕ вызывает `SET LOCAL app.current_user_id/role` |
| **C4** | **API request logging** -> `api_logs` | 1.3.5 | Таблица есть, middleware нет |
| **C5** | **Cleanup cron jobs** | 1.3.5 | `api_logs` 30 дней, `auth_events` 90 дней — cron не реализован |

### Важно (нужно до v1)

| # | Требование ТЗ | Раздел ТЗ | Что отсутствует |
|---|---|---|---|
| **I1** | **Idempotency-Key** header | 2.5 | ТЗ требует для POST /transfers, /stages, /hearings, /deactivate. Не реализовано |
| **I2** | **Email (UniSender)** | 5.1 | Worker stub логирует в console. Реальной интеграции нет |
| **I3** | **Hearing reminder cron** | уведомления | `notifyHearingReminder()` есть, cron job нет |
| **I4** | **"Без движения" cron** | уведомления | Отчёт stale >30д есть, автоуведомления нет |
| **I5** | **Audit log old_value** | 1.3.5 | PATCH эндпоинты записывают audit, но `old_value` не всегда заполняется |
| **I6** | **Frontend: Reports page** | — | Route в навигации, страница не создана |
| **I7** | **Frontend: Case create form** | — | Кнопка ведёт на `/cases/new`, страницы нет |
| **I8** | **Frontend: Users page** | — | Нет страницы управления пользователями |

### Можно отложить (v1.1+)

| # | Требование | Раздел ТЗ |
|---|---|---|
| D1 | Sentry integration | 2.1 |
| D2 | Uptime Robot setup | 2.2 |
| D3 | git-secrets pre-commit hook | 1.3.2 |
| D4 | S3 Lifecycle Rule configuration | 1.3.4 |
| D5 | Audit_log partition auto-creation cron | 8.5 |

---

## 3. Отклонения от ТЗ

| # | Что в ТЗ | Что в коде | Серьёзность |
|---|---|---|---|
| **O1** | `PATCH /cases/:id/status` не должен автоматически менять `final_result` | Реализовано корректно — возвращает `suggestion`, не меняет | OK |
| **O2** | Стадия `sort_order`: предупреждение, не блокировка | Реализовано корректно — warning в ответе | OK |
| **O3** | Refresh token cookie path | `path: '/v1/auth'` — cookie не отправится на `/api/v1/auth/refresh` через nginx proxy | **Баг** |
| **O4** | Soft delete контрагента: запрет при активных делах | Parties API не существует — не проверяется | **Missing** |
| **O5** | Rate limiting через Redis sliding window | Не реализовано | **Missing** |
| **O6** | `app.current_user_id` через `set_config` | Не реализовано — авторизация только на уровне Express | **Gap** |
| **O7** | `Idempotency-Key` для POST transfers, stages, hearings | Не реализовано | **Gap** |
| **O8** | `npm run db:migrate` | Работает через workspace scripts | OK |
| **O9** | Viewer: скачивание файлов "своё дело" | Viewer видит ВСЕ файлы — по ТЗ viewer видит все дела, уточнить | **Уточнить** |

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|---|
| **R1** | Parties API отсутствует — фронт сломан | 100% | Высокое | Реализовать parties CRUD (2ч) |
| **R2** | Нет rate limiting — DoS | Высокая | Высокое | Redis sliding window middleware (4ч) |
| **R3** | RLS не активен — данные не фильтруются на уровне БД | Средняя | Высокое | Middleware set_config (2ч) |
| **R4** | Cookie path mismatch — refresh не работает через nginx | Высокая | Высокое | Изменить path (15м) |
| **R5** | Express 5 в beta | Низкая | Среднее | Fallback на Express 4 тривиальный |
| **R6** | Selectel S3 совместимость | Средняя | Среднее | Тестировать с реальным бакетом |
| **R7** | Нет нагрузочного тестирования | — | Среднее | k6/autocannon перед запуском |

---

## 5. Что критично исправить перед продом

### Must fix (блокеры)

| Приоритет | Задача | Оценка | Почему критично |
|---|---|---|---|
| **P0** | Parties CRUD API | 2ч | Frontend PartiesPage -> 404 |
| **P0** | Rate limiting middleware | 4ч | Открыт для DoS |
| **P0** | Cookie path fix | 15м | Refresh не работает через nginx -> разлогин через 15 мин |
| **P0** | RLS set_config middleware | 2ч | Второй рубеж защиты не работает |
| **P1** | API request logging middleware | 2ч | ТЗ требует для аудита |
| **P1** | Cleanup crons (api_logs, auth_events) | 1ч | Таблицы будут расти бесконечно |
| **P1** | Viewer document access — уточнить | 15м | Возможная утечка данных |

### Should fix (до первых пользователей)

| Приоритет | Задача | Оценка |
|---|---|---|
| P2 | Idempotency-Key middleware | 3ч |
| P2 | Frontend: Reports page | 4ч |
| P2 | Frontend: Case create form | 2ч |
| P2 | Frontend: Users management page | 4ч |
| P2 | UniSender email integration | 3ч |
| P2 | Hearing reminder cron | 2ч |

---

## 6. Checklist запуска

### Инфраструктура

- [ ] SSL сертификаты в `infra/nginx/ssl/` (Let's Encrypt)
- [ ] GitHub Environments: `staging` (auto), `production` (1+ reviewer)
- [ ] GitHub Secrets: все 17 секретов (см. deploy.yml)
- [ ] Selectel: S3 бакет `yurdelo-docs` + Lifecycle Rule (delete tagged `deleted=true` after 30 days)
- [ ] Selectel: Managed PostgreSQL с ролью `app_user`
- [ ] DNS: `api.yurdelo.ru` -> staging/production IP
- [ ] Backup: PG ежедневно (30 дней), файлы еженедельно (4 копии)

### Код (P0 блокеры)

- [ ] Parties CRUD API (`routes/parties.ts`)
- [ ] Rate limiting middleware (Redis sliding window)
- [ ] Fix cookie path (`/v1/auth` -> `/api/v1/auth` или убрать `path`)
- [ ] RLS set_config middleware
- [ ] API logging middleware -> `api_logs`
- [ ] Cleanup cron jobs

### Тестирование

- [ ] Smoke test staging: `curl /health` -> `{"status":"ok"}`
- [ ] Login flow: email -> password -> 2FA -> redirect
- [ ] CRUD дел: создать -> редактировать -> передать -> закрыть
- [ ] Загрузка файла: upload -> download signed URL -> delete
- [ ] Проверить RLS: lawyer не видит чужие дела
- [ ] Проверить 409 STALE_DATA: два браузера -> одновременное редактирование
- [ ] Проверить rate limit: 101+ запрос за минуту -> 429
- [ ] Нагрузочный тест: 10 concurrent users, p95 < 500ms

### Мониторинг

- [ ] Sentry: DSN в env, `@sentry/node` подключён
- [ ] Uptime Robot: check `/health` каждые 5 мин -> alert на email
- [ ] Логи: `docker logs yurdelo-backend` -> pino JSON output

### Безопасность

- [ ] `.env` НЕ в git (`git log -p .env` -> ничего)
- [ ] JWT_SECRET: 32+ символов, random
- [ ] CORS: настроить `origin: 'https://yurdelo.ru'`
- [ ] Helmet headers: подключить `helmet()` middleware
- [ ] `git-secrets`: hook на pre-commit
