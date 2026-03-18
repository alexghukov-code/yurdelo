-- Up Migration
-- Additional indexes for api_logs analytics queries

CREATE INDEX idx_api_logs_user_id    ON api_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_api_logs_status     ON api_logs (status_code);

-- Down Migration

DROP INDEX IF EXISTS idx_api_logs_status;
DROP INDEX IF EXISTS idx_api_logs_user_id;
