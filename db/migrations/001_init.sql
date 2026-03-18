-- Up Migration

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUM types ──────────────────────────────────────

CREATE TYPE user_role     AS ENUM ('admin', 'lawyer', 'viewer');
CREATE TYPE user_status   AS ENUM ('active', 'inactive');
CREATE TYPE case_status   AS ENUM ('active', 'closed', 'suspended');
CREATE TYPE case_category AS ENUM ('civil', 'arbitration', 'admin', 'criminal', 'labor');
CREATE TYPE final_result  AS ENUM ('win', 'lose', 'part', 'world');
CREATE TYPE hearing_type  AS ENUM ('hearing', 'adj', 'result', 'note');
CREATE TYPE audit_action  AS ENUM (
  'CREATE', 'UPDATE', 'DELETE', 'TRANSFER',
  'DEACTIVATE', 'RESTORE', 'LOGIN', 'LOGOUT'
);

-- ── Reusable trigger: auto-update updated_at ────────

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Down Migration

DROP FUNCTION IF EXISTS trigger_set_updated_at() CASCADE;
DROP TYPE IF EXISTS audit_action;
DROP TYPE IF EXISTS hearing_type;
DROP TYPE IF EXISTS final_result;
DROP TYPE IF EXISTS case_category;
DROP TYPE IF EXISTS case_status;
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS user_role;
DROP EXTENSION IF EXISTS "pgcrypto";
