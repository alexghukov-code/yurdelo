-- Up Migration

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_name       VARCHAR(100)  NOT NULL CHECK (char_length(last_name) >= 2),
  first_name      VARCHAR(100)  NOT NULL CHECK (char_length(first_name) >= 2),
  middle_name     VARCHAR(100),
  email           VARCHAR(255)  NOT NULL,
  password_hash   VARCHAR(255)  NOT NULL,
  role            user_role     NOT NULL DEFAULT 'lawyer',
  status          user_status   NOT NULL DEFAULT 'active',
  phone           VARCHAR(50),
  two_fa_enabled  BOOLEAN       NOT NULL DEFAULT false,
  two_fa_secret   VARCHAR(255),
  terminate_date  TIMESTAMPTZ,
  terminate_reason TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Email unique among non-deleted users
CREATE UNIQUE INDEX users_email_unique ON users (email) WHERE deleted_at IS NULL;

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS users CASCADE;
