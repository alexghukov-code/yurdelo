# Финальный UI Pre-Release Audit — ЮрДело v2.1

**Дата:** 2026-03-18
**Коммитов:** 29 (fa552cb → 6e69b5f)
**Working tree:** чист
**Source files:** 59 frontend + backend
**Test files:** 20 frontend + 13 backend

## Quality Gates

| Check | Результат |
|-------|-----------|
| TypeScript | 0 errors |
| ESLint | 0 errors, 162 warnings (all `no-explicit-any` in formatters) |
| Prettier | All files formatted |
| Tests | **513** (413 backend + 100 frontend), all passing |

---

## 1. Core Flows

### Case Lifecycle

| Flow | Реализация | Файлы | Тесты |
|------|-----------|-------|-------|
| Create case | CaseForm + CaseCreatePage + modal в CasesPage | CaseForm, CaseCreatePage, CasesPage | case-form (9), admin-flows (2) |
| View case list | Поиск debounce 300ms, фильтры, пагинация | CasesPage | admin/lawyer/viewer-flows |
| View case detail | PageSkeleton → QueryErrorView → data | CaseDetailPage | case-detail-errors (3), e2e (6) |
| Edit case | Inline toggle view/edit, CaseForm mode="edit" | CaseDetailPage | - |
| Change status | StatusMenu dropdown + confirm dialogs (active↔closed↔suspended) | StatusMenu | - |
| Set final result | FinalResultMenu inline в info grid, confirm per result | FinalResultMenu | - |
| Delete case | PermissionGate case:delete, confirm | CaseDetailPage | admin-flows, viewer-flows |
| Optimistic locking | updatedAt на edit/status/result, 409 → StaleDataModal | CaseDetailPage, StaleDataModal | error-flows |

### Stages

| Flow | Реализация |
|------|-----------|
| Add stage | StageFormModal create, select stage type, court, case number |
| Edit stage | StageFormModal edit, предзаполнение, updatedAt |
| Sort order warning | Non-blocking yellow banner при нарушении порядка |
| Access | canEdit (admin + owner-lawyer), viewer не видит кнопки |

### Hearings

| Flow | Реализация |
|------|-----------|
| Add hearing | HearingFormModal, 4 типа (hearing/adj/result/note) |
| Edit hearing | Предзаполнение + updatedAt, 409 handling |
| Conditional fields | type=result → result+appealed, type=adj → newDatetime+adjReason |
| Result suggestion | После создания type=result → banner «Обновить final_result?» Да/Нет |
| Access | canEdit only |

### Documents

| Flow | Реализация |
|------|-----------|
| List documents | DocumentList внутри каждого слушания, имя+размер |
| Upload | File input + progress bar, 50MB client check |
| Download | On-demand signed URL → window.open (no expiry risk) |
| Delete | admin any, lawyer own uploads, confirm dialog |
| Access | Upload/delete: canEdit only. Download: все (Вариант A) |

### Transfers

| Flow | Реализация |
|------|-----------|
| View history | Timeline в CaseDetailPage (from→to, date, comment) |
| Transfer case | TransferModal, select lawyer, 2-step confirm |
| Errors | Self-transfer, duplicate, inactive recipient → global toast |
| Access | canEdit only |

---

## 2. User Management

| Flow | Доступ | Реализация |
|------|--------|-----------|
| Users list | Все (role-aware columns) | UsersPage, фильтры role/status, пагинация |
| Create user | admin | CreateUserModal, password validation |
| View profile | Все | UserProfilePage, role-aware fields |
| Edit profile | admin (all), lawyer (own email/phone) | Inline edit + updatedAt |
| Deactivate | admin (не себя) | DeactivateUserModal, case transfer |
| Restore | admin | RestoreUserModal, role select |
| Change password | Все (own) | ChangePasswordSection, confirm match |
| 2FA setup | Все (own) | TwoFaSection, QR + TOTP verify |
| User history | Все | Timeline в UserProfilePage |

---

## 3. Reports

| Вкладка | Доступ | Реализация |
|---------|--------|-----------|
| Мои показатели | admin + lawyer | 6 stat cards + bar chart breakdown |
| Нагрузка | admin | Таблица: адвокат, активные, закрытые, всего |
| Результаты | admin | Таблица с win rate % |
| Застой | admin | Цветовой код дней, ссылки на дела |
| Дела | admin | Категории, period selector |
| Финансы | admin | Форматированные суммы ₽ |

---

## 4. Роли

### admin

| Область | Доступ |
|---------|--------|
| Sidebar | Дела, Контрагенты, Календарь, Отчёты, Пользователи |
| Cases | CRUD + status + result + transfer + stages + hearings + documents |
| Users | Create, edit all fields, deactivate, restore |
| Reports | Все 6 вкладок |
| Тесты | admin-flows (5 e2e) |

### lawyer

| Область | Доступ |
|---------|--------|
| Sidebar | Дела, Контрагенты, Календарь, Отчёты (без Пользователи) |
| Cases | Только свои: create + edit + status + result + transfer + stages + hearings + documents |
| Other cases | Read-only, без action кнопок |
| Users | Edit own email/phone, change password, 2FA |
| Reports | Только «Мои показатели» |
| Route guards | /cases/new → разрешён, /users → нет в sidebar |
| Тесты | lawyer-flows (6 e2e) |

### viewer

| Область | Доступ |
|---------|--------|
| Sidebar | Дела, Контрагенты, Календарь (без Отчёты, Пользователи) |
| Cases | Read-only: видит все дела, стадии, слушания, документы (download) |
| Actions | Нет: create/edit/delete/transfer/upload кнопки скрыты |
| Route guards | /cases/new → ForbiddenState, /reports → ForbiddenState |
| Users | Только свой профиль: read-only, change password, 2FA |
| Тесты | viewer-flows (7 e2e) |

---

## 5. Mobile

| Аспект | Реализация |
|--------|-----------|
| Sidebar | Collapsible drawer < 768px, hamburger в Topbar |
| Close | X кнопка, backdrop click, route change |
| Desktop | Без изменений, static sidebar |
| Тесты | mobile-sidebar (5 тестов) |

---

## 6. Error Handling

| Код | Обработка | Тесты |
|-----|-----------|-------|
| 401 | Silent refresh → redirect /login?returnTo= | error-flows, client-interceptor (4) |
| 403 | ForbiddenState (route + query) | error-flows, viewer-flows |
| 404 | QueryErrorView без retry | error-flows, case-detail-errors |
| 409 | Global toast + StaleDataModal per-page | error-flows |
| 429 | Toast с Retry-After секундами | error-layer (4) |
| 500 | QueryErrorView с retry | error-flows (2) |

---

## 7. Loading / Empty / Error States

| Страница | Loading | Error | Empty |
|----------|---------|-------|-------|
| Login | Button disabled | Inline | N/A |
| Dashboard | PageSkeleton | QueryErrorView | EmptyState |
| Cases | PageSkeleton table | QueryErrorView | EmptyState |
| CaseDetail | PageSkeleton | QueryErrorView | Inline per section |
| Parties | PageSkeleton table | QueryErrorView | EmptyState |
| Calendar | PageSkeleton | QueryErrorView | EmptyState |
| Users | PageSkeleton table | QueryErrorView | EmptyState |
| UserProfile | PageSkeleton | QueryErrorView | Inline |
| Reports | PageSkeleton per tab | QueryErrorView per tab | EmptyState per tab |
| NotificationBell | N/A | Inline error | Inline text |

---

## Verdict

### Ready for production: ДА

Все блокеры из предыдущего аудита закрыты:

| # | Блокер | Статус |
|---|--------|--------|
| P1 | HearingFormModal | `d661e43` — закрыт |
| P2 | Parties edit/delete | `4cf7617` — закрыт |
| P2 | Password change UI | `6d50508` — закрыт |
| P2 | 2FA setup UI | `c3d8ff7` — закрыт |
| P3 | Mobile sidebar | `81e61e1` — закрыт |
| P3 | Lint/format | `6e69b5f` — закрыт |

### Оставшиеся риски (не блокеры)

| # | Риск | Критичность | Mitigation |
|---|------|-------------|------------|
| 1 | `no-explicit-any` warnings (162) | Низкая | Backend formatters + test mocks. Не влияет на runtime. Можно типизировать постепенно |
| 2 | Нет disable 2FA endpoint | Низкая | Backend не реализован. Если пользователь потеряет authenticator — admin reset через БД |
| 3 | Notification preferences UI | Низкая | Notifications работают, UI настроек — будущая фича |
| 4 | PartySelect — basic UX | Низкая | Search + select list, не combobox/autocomplete. Достаточно для 2-5 пользователей |
| 5 | Нет keyboard navigation в dropdowns (StatusMenu, FinalResultMenu, UserMenu) | Низкая | Mouse-only. Accessibility улучшение для следующей итерации |
| 6 | Signed URL sharing risk | Низкая | URL действует 1 час. Mitigation: on-demand generation, не кэшируется |
