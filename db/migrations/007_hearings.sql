-- Up Migration

CREATE TABLE hearings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id      UUID          NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  type          hearing_type  NOT NULL,
  datetime      TIMESTAMPTZ   NOT NULL,
  result        final_result,
  appealed      BOOLEAN,
  new_datetime  TIMESTAMPTZ,
  adj_reason    VARCHAR(200),
  notes         TEXT,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- type='result' requires result
  CONSTRAINT chk_result_requires_value
    CHECK (type != 'result' OR result IS NOT NULL),

  -- appealed only for type='result'
  CONSTRAINT chk_appealed_only_result
    CHECK (type = 'result' OR appealed IS NULL),

  -- type='adj' requires new_datetime
  CONSTRAINT chk_adj_requires_new_datetime
    CHECK (type != 'adj' OR new_datetime IS NOT NULL)
);

CREATE TRIGGER set_hearings_updated_at
  BEFORE UPDATE ON hearings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS hearings CASCADE;
