-- Up Migration

CREATE TABLE stage_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100)  NOT NULL,
  sort_order  INTEGER       NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX stage_types_name_unique ON stage_types (name) WHERE deleted_at IS NULL;

-- Down Migration

DROP TABLE IF EXISTS stage_types CASCADE;
