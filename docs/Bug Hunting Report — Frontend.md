# Bug Hunting Report — Frontend

**Дата:** 2026-03-18
**Аудитор:** Claude Opus 4.6
**Область:** packages/frontend/src/

---

## P0 (Критические) — исправить до production

| # | Категория | Файл | Описание |
|---|-----------|------|----------|
| 1 | SECURITY | `api/client.ts:61` | `returnTo` может содержать sensitive query params из URL — попадёт в browser history. При 401 redirect `window.location.search` может включать токены или другие секреты |
| 2 | SECURITY | `api/auth.ts` | Нет CSRF-защиты. `withCredentials: true` позволяет cross-site logout/actions. Атакующий может создать форму на своём сайте, которая выполнит POST на `/auth/logout` |
| 3 | EDGE | `pages/CaseDetailPage.tsx:198` | `claimAmount === 0` — falsy, показывает «—» вместо «0 ₽». Условие `c.claimAmount ? ... : '—'` не отличает 0 от null |

---

## P1 (Высокие) — исправить до staging demo

| # | Категория | Файл | Описание |
|---|-----------|------|----------|
| 4 | RACE | `api/client.ts:8-71` | Token refresh — concurrent modifications `failedQueue` при 3+ одновременных 401. Массив модифицируется без синхронизации |
| 5 | EDGE | `pages/ReportsPage.tsx:102` | `results?.wins` может быть `undefined` → NaN в `Math.max` → bar chart ломается. Ширина бара станет `NaN%` |
| 6 | UX | `components/TransferModal.tsx:58` | После ошибки transfer кнопка снова активна, повторный клик → двойная мутация. `confirmed` state не сбрасывается |
| 7 | RACE | `components/StatusMenu.tsx:44-50` | Stale closure в `handleClick` — быстрое открытие/закрытие может не закрыть menu. Event listener ссылается на старый ref |
| 8 | UX | `components/DeactivateUserModal.tsx:27` | Дата сбрасывается на «сегодня» при каждом открытии модалки (ожидаемое поведение для нового открытия, но форма не делает полный reset) |

---

## P2 (Средние) — исправить в следующей итерации

| # | Категория | Файл | Описание |
|---|-----------|------|----------|
| 9 | EDGE | `pages/CaseDetailPage.tsx:381` | `t.fromName` / `t.toName` без null-check. Если API вернёт transfer без имён — пустое место в UI |
| 10 | RACE | `components/Sidebar.tsx:27` | `onClose` не в deps useEffect — stale closure. При смене onClose callback старый listener продолжает ссылаться на предыдущую версию |
| 11 | UX | `components/CreateUserModal.tsx` | Форма не сбрасывается при повторном открытии. `defaultValues` устанавливаются один раз при mount, не при каждом open |
| 12 | ASYNC | `hooks/useCases.ts:49` | Двойной `invalidateQueries` для `['cases']` и `['cases', id]` → redundant refetch. На медленной сети — два параллельных запроса |
| 13 | UX | `pages/CalendarPage.tsx:105` | «+5» не кликабельно, нельзя увидеть все события дня. Пользователь видит индикатор но не может развернуть |
| 14 | SECURITY | `pages/UserProfilePage.tsx:405` | QR URL не валидируется, содержит secret в plaintext. Если API response перехвачен — секрет 2FA скомпрометирован |
| 15 | UX | `pages/UserProfilePage.tsx:258` | `reset()` после смены пароля не очищает визуальные ошибки. Старые validation errors могут оставаться видимыми |
| 16 | EDGE | `pages/CaseDetailPage.tsx:127` | `c.pltName` / `c.defName` без fallback при null. Subtitle отображает `undefined vs undefined` |
| 17 | RACE | `pages/CaseDetailPage.tsx:51` | transfers query с `enabled: !!caseData` — при быстрой навигации между делами query может использовать stale `id` от предыдущего дела |

---

## P3 (Низкие) — backlog

| # | Категория | Файл | Описание |
|---|-----------|------|----------|
| 18 | UX | `components/DocumentList.tsx:55` | Download без loading indicator. Пользователь не знает, был ли клик обработан |
| 19 | UX | `components/NotificationBell.tsx:34` | Badge overflow при 999+ уведомлений. Текст может выйти за пределы badge |
| 20 | ASYNC | `components/DocumentList.tsx:67` | `fileRef.value = ''` выполняется при любом результате. При неудаче повторный выбор того же файла не сработает (браузер не вызовет onChange) |
| 21 | EDGE | `components/DocumentList.tsx:20` | `fmtSize(NaN)` → «NaN МБ». Нет защиты от невалидного значения fileSize |

---

## Сводка

| Приоритет | Количество | Категории |
|-----------|-----------|-----------|
| P0 | 3 | 2 security, 1 edge |
| P1 | 5 | 1 race, 1 edge, 2 UX, 1 race |
| P2 | 9 | 2 edge, 2 race, 2 UX, 1 async, 1 security, 1 edge |
| P3 | 4 | 2 UX, 1 async, 1 edge |
| **Итого** | **21** | |

---

## Рекомендации по приоритету исправления

### До production (P0):
1. Санитизировать `returnTo` — удалять query params с sensitive data
2. Добавить CSRF-token или использовать `SameSite=Strict` cookie (уже есть на backend)
3. Исправить `claimAmount === 0` falsy check

### До staging demo (P1):
4. Убедиться что token refresh queue thread-safe (JavaScript однопоточный — фактически safe, но стоит добавить defensive checks)
5. Добавить `?? 0` для всех числовых полей в ReportsPage
6. Сбрасывать `confirmed` state в TransferModal при ошибке
7. Добавить `onClose` в deps useEffect в StatusMenu
8. Исправить reset формы в DeactivateUserModal

### В следующей итерации (P2-P3):
- Null-safety для опциональных полей в отображении
- Loading state для download
- Reset форм при повторном открытии модалок
- Валидация QR URL
