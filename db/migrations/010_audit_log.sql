-- Up Migration

CREATE TABLE audit_log (
  id            UUID          NOT NULL DEFAULT gen_random_uuid(),
  user_id       UUID,
  action        audit_action  NOT NULL,
  entity_type   VARCHAR(50)   NOT NULL,
  entity_id     UUID          NOT NULL,
  old_value     JSONB,
  new_value     JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Partitions: 2024–2027. New partitions created by cron yearly.
CREATE TABLE audit_log_2024 PARTITION OF audit_log
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE audit_log_2025 PARTITION OF audit_log
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE audit_log_2026 PARTITION OF audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE audit_log_2027 PARTITION OF audit_log
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

-- Down Migration

DROP TABLE IF EXISTS audit_log CASCADE;
