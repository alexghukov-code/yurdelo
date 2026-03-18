-- Up Migration

CREATE TABLE stages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID          NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  stage_type_id   UUID          NOT NULL REFERENCES stage_types(id),
  sort_order      INTEGER       NOT NULL,
  court           VARCHAR(500)  NOT NULL CHECK (char_length(court) >= 3),
  case_number     VARCHAR(100)  NOT NULL CHECK (char_length(case_number) >= 5),
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_stages_updated_at
  BEFORE UPDATE ON stages
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS stages CASCADE;
