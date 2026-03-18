-- Up Migration

CREATE TABLE cases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(500)    NOT NULL CHECK (char_length(name) >= 3),
  plt_id        UUID            NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  def_id        UUID            NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  lawyer_id     UUID            NOT NULL REFERENCES users(id)   ON DELETE RESTRICT,
  category      case_category   NOT NULL,
  status        case_status     NOT NULL DEFAULT 'active',
  final_result  final_result,
  claim_amount  NUMERIC(15,2)   CHECK (claim_amount >= 0),
  closed_at     TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS cases CASCADE;
