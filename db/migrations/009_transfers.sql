-- Up Migration

CREATE TABLE transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID          NOT NULL REFERENCES cases(id),
  from_id         UUID          NOT NULL REFERENCES users(id),
  to_id           UUID          NOT NULL REFERENCES users(id),
  transfer_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  comment         TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Cannot transfer to yourself
  CONSTRAINT chk_transfer_not_self CHECK (from_id != to_id),

  -- One transfer per case per recipient per day
  CONSTRAINT uq_transfer_case_to_date UNIQUE (case_id, to_id, transfer_date)
);

-- Down Migration

DROP TABLE IF EXISTS transfers CASCADE;
