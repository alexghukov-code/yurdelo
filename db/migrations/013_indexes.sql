-- Up Migration

-- ── cases ───────────────────────────────────────────
CREATE INDEX idx_cases_lawyer_id       ON cases (lawyer_id);
CREATE INDEX idx_cases_status_deleted   ON cases (status, deleted_at);
CREATE INDEX idx_cases_parties         ON cases (plt_id, def_id);
CREATE INDEX idx_cases_name_search     ON cases USING GIN (to_tsvector('russian', name));

-- ── hearings ────────────────────────────────────────
CREATE INDEX idx_hearings_stage_id     ON hearings (stage_id);
CREATE INDEX idx_hearings_datetime     ON hearings (datetime);
CREATE INDEX idx_hearings_type_dt      ON hearings (type, datetime);

-- ── stages ──────────────────────────────────────────
CREATE INDEX idx_stages_case_id        ON stages (case_id);

-- ── transfers ───────────────────────────────────────
CREATE INDEX idx_transfers_case_id     ON transfers (case_id);
CREATE INDEX idx_transfers_participants ON transfers (from_id, to_id);

-- ── audit_log ───────────────────────────────────────
CREATE INDEX idx_audit_entity          ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_created_at      ON audit_log (created_at);

-- ── notifications ───────────────────────────────────
CREATE INDEX idx_notifications_user_read ON notifications (user_id, is_read);

-- ── documents ───────────────────────────────────────
CREATE INDEX idx_documents_hearing_id  ON documents (hearing_id);
CREATE INDEX idx_documents_case_id     ON documents (case_id);

-- ── auth_events ─────────────────────────────────────
CREATE INDEX idx_auth_events_created   ON auth_events (created_at);

-- ── api_logs ────────────────────────────────────────
CREATE INDEX idx_api_logs_created      ON api_logs (created_at);

-- ── user_history ────────────────────────────────────
CREATE INDEX idx_user_history_user_id  ON user_history (user_id);

-- Down Migration

DROP INDEX IF EXISTS idx_user_history_user_id;
DROP INDEX IF EXISTS idx_api_logs_created;
DROP INDEX IF EXISTS idx_auth_events_created;
DROP INDEX IF EXISTS idx_documents_case_id;
DROP INDEX IF EXISTS idx_documents_hearing_id;
DROP INDEX IF EXISTS idx_notifications_user_read;
DROP INDEX IF EXISTS idx_audit_created_at;
DROP INDEX IF EXISTS idx_audit_entity;
DROP INDEX IF EXISTS idx_transfers_participants;
DROP INDEX IF EXISTS idx_transfers_case_id;
DROP INDEX IF EXISTS idx_stages_case_id;
DROP INDEX IF EXISTS idx_hearings_type_dt;
DROP INDEX IF EXISTS idx_hearings_datetime;
DROP INDEX IF EXISTS idx_hearings_stage_id;
DROP INDEX IF EXISTS idx_cases_name_search;
DROP INDEX IF EXISTS idx_cases_parties;
DROP INDEX IF EXISTS idx_cases_status_deleted;
DROP INDEX IF EXISTS idx_cases_lawyer_id;
