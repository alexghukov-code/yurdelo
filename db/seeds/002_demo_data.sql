-- Up Migration
-- Demo data for dev/staging only. Passwords: "Password1" (bcrypt cost 12).

-- ── Users ───────────────────────────────────────────
INSERT INTO users (id, last_name, first_name, middle_name, email, password_hash, role, status, two_fa_enabled) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Иванов',   'Алексей',  'Петрович',   'admin@yurdelo.ru',   '$2a$12$LJ3m4ys3Lf.QzR9QV4VYsOe/KJGRZ8xHBy1mfcRLq7oFm1tGxKxGm', 'admin',  'active', false),
  ('b0000000-0000-0000-0000-000000000002', 'Петрова',  'Мария',    'Ивановна',   'lawyer1@yurdelo.ru', '$2a$12$LJ3m4ys3Lf.QzR9QV4VYsOe/KJGRZ8xHBy1mfcRLq7oFm1tGxKxGm', 'lawyer', 'active', false),
  ('b0000000-0000-0000-0000-000000000003', 'Сидоров',  'Дмитрий',  'Александрович','lawyer2@yurdelo.ru','$2a$12$LJ3m4ys3Lf.QzR9QV4VYsOe/KJGRZ8xHBy1mfcRLq7oFm1tGxKxGm', 'lawyer', 'active', false),
  ('b0000000-0000-0000-0000-000000000004', 'Козлова',  'Анна',     NULL,          'viewer@yurdelo.ru', '$2a$12$LJ3m4ys3Lf.QzR9QV4VYsOe/KJGRZ8xHBy1mfcRLq7oFm1tGxKxGm', 'viewer', 'active', false)
ON CONFLICT DO NOTHING;

-- ── Parties ─────────────────────────────────────────
INSERT INTO parties (id, name, inn) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'ООО "Альфа Групп"',         '7701234567'),
  ('c0000000-0000-0000-0000-000000000002', 'ИП Смирнов А.В.',           '770987654321'),
  ('c0000000-0000-0000-0000-000000000003', 'ПАО "Бета Строй"',          '7702345678'),
  ('c0000000-0000-0000-0000-000000000004', 'Администрация г. Москвы',   NULL)
ON CONFLICT DO NOTHING;

-- ── Cases ───────────────────────────────────────────
INSERT INTO cases (id, name, plt_id, def_id, lawyer_id, category, status, claim_amount) VALUES
  ('d0000000-0000-0000-0000-000000000001',
   'Взыскание задолженности по договору поставки №12/2025',
   'c0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000002',
   'arbitration', 'active', 1500000.00),

  ('d0000000-0000-0000-0000-000000000002',
   'Оспаривание решения налогового органа',
   'c0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000004',
   'b0000000-0000-0000-0000-000000000003',
   'admin', 'active', 850000.00)
ON CONFLICT DO NOTHING;

-- ── Stages ──────────────────────────────────────────
INSERT INTO stages (id, case_id, stage_type_id, sort_order, court, case_number) VALUES
  ('e0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000002',
   2, 'Арбитражный суд г. Москвы', 'А40-12345/2025'),

  ('e0000000-0000-0000-0000-000000000002',
   'd0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   1, 'ФНС России по г. Москве', 'ДС-2025/789')
ON CONFLICT DO NOTHING;

-- ── Hearings ────────────────────────────────────────
INSERT INTO hearings (id, stage_id, type, datetime) VALUES
  ('f0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001',
   'hearing', '2026-04-15 10:00:00+03')
ON CONFLICT DO NOTHING;

-- Down Migration

DELETE FROM hearings   WHERE id LIKE 'f0000000%';
DELETE FROM stages     WHERE id LIKE 'e0000000%';
DELETE FROM cases      WHERE id LIKE 'd0000000%';
DELETE FROM parties    WHERE id LIKE 'c0000000%';
DELETE FROM users      WHERE id LIKE 'b0000000%';
