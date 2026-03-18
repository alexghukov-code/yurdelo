-- Up Migration

CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hearing_id    UUID          NOT NULL REFERENCES hearings(id) ON DELETE CASCADE,
  case_id       UUID          NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  file_name     VARCHAR(500)  NOT NULL,
  file_size     INTEGER       NOT NULL CHECK (file_size > 0 AND file_size <= 52428800),
  mime_type     VARCHAR(100),
  s3_key        VARCHAR(500)  NOT NULL,
  uploaded_by   UUID          NOT NULL REFERENCES users(id),
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Down Migration

DROP TABLE IF EXISTS documents CASCADE;
