-- Up Migration

CREATE TABLE parties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(500)  NOT NULL CHECK (char_length(name) >= 2),
  inn         VARCHAR(12),
  ogrn        VARCHAR(15),
  address     TEXT,
  phone       VARCHAR(50),
  email       VARCHAR(255),
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_parties_updated_at
  BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS parties CASCADE;
