-- Up Migration

-- ── user_history ────────────────────────────────────

CREATE TABLE user_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES users(id),
  event         VARCHAR(50)   NOT NULL,
  event_date    DATE          NOT NULL,
  comment       TEXT,
  performed_by  UUID          REFERENCES users(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── auth_events ─────────────────────────────────────

CREATE TABLE auth_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          REFERENCES users(id),
  event         VARCHAR(50)   NOT NULL,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── api_logs (30 day retention, cleaned by cron) ────

CREATE TABLE api_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method          VARCHAR(10)   NOT NULL,
  url             VARCHAR(500)  NOT NULL,
  status_code     INTEGER       NOT NULL,
  response_time_ms INTEGER,
  user_id         UUID,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── failed_notifications ────────────────────────────

CREATE TABLE failed_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          REFERENCES users(id),
  trigger_type  VARCHAR(50)   NOT NULL,
  payload       JSONB,
  attempts      INTEGER       NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_failed_notifications_updated_at
  BEFORE UPDATE ON failed_notifications
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS failed_notifications CASCADE;
DROP TABLE IF EXISTS api_logs CASCADE;
DROP TABLE IF EXISTS auth_events CASCADE;
DROP TABLE IF EXISTS user_history CASCADE;
