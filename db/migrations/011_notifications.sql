-- Up Migration

CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES users(id),
  type          VARCHAR(50)   NOT NULL,
  title         VARCHAR(500)  NOT NULL,
  message       TEXT,
  entity_type   VARCHAR(50),
  entity_id     UUID,
  is_read       BOOLEAN       NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Down Migration

DROP TABLE IF EXISTS notifications CASCADE;
