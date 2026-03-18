-- Up Migration

-- ══════════════════════════════════════════════════════
-- Row Level Security policies
-- Session vars set by Express middleware per request:
--   app.current_user_id   (UUID)
--   app.current_user_role ('admin' | 'lawyer' | 'viewer')
-- ══════════════════════════════════════════════════════

-- Helper: safely read session var (returns NULL if not set)
CREATE OR REPLACE FUNCTION app_uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_role() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_user_role', true), '');
$$ LANGUAGE sql STABLE;


-- ── cases ───────────────────────────────────────────

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases FORCE ROW LEVEL SECURITY;

CREATE POLICY cases_admin_all ON cases
  FOR ALL
  USING (app_role() = 'admin' AND deleted_at IS NULL);

CREATE POLICY cases_lawyer_select ON cases
  FOR SELECT
  USING (app_role() = 'lawyer' AND lawyer_id = app_uid() AND deleted_at IS NULL);

CREATE POLICY cases_lawyer_insert ON cases
  FOR INSERT
  WITH CHECK (app_role() = 'lawyer');

CREATE POLICY cases_lawyer_update ON cases
  FOR UPDATE
  USING (app_role() = 'lawyer' AND lawyer_id = app_uid() AND deleted_at IS NULL);

CREATE POLICY cases_viewer_select ON cases
  FOR SELECT
  USING (app_role() = 'viewer' AND deleted_at IS NULL);


-- ── stages ──────────────────────────────────────────

ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages FORCE ROW LEVEL SECURITY;

CREATE POLICY stages_admin_all ON stages
  FOR ALL
  USING (
    app_role() = 'admin'
    AND deleted_at IS NULL
  );

CREATE POLICY stages_lawyer_select ON stages
  FOR SELECT
  USING (
    app_role() = 'lawyer'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = stages.case_id AND c.lawyer_id = app_uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY stages_lawyer_insert ON stages
  FOR INSERT
  WITH CHECK (
    app_role() = 'lawyer'
    AND EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = stages.case_id AND c.lawyer_id = app_uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY stages_lawyer_update ON stages
  FOR UPDATE
  USING (
    app_role() = 'lawyer'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = stages.case_id AND c.lawyer_id = app_uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY stages_viewer_select ON stages
  FOR SELECT
  USING (
    app_role() = 'viewer'
    AND deleted_at IS NULL
  );


-- ── hearings ────────────────────────────────────────

ALTER TABLE hearings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hearings FORCE ROW LEVEL SECURITY;

CREATE POLICY hearings_admin_all ON hearings
  FOR ALL
  USING (
    app_role() = 'admin'
    AND deleted_at IS NULL
  );

CREATE POLICY hearings_lawyer_select ON hearings
  FOR SELECT
  USING (
    app_role() = 'lawyer'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM stages s
      JOIN cases c ON c.id = s.case_id
      WHERE s.id = hearings.stage_id AND c.lawyer_id = app_uid()
        AND s.deleted_at IS NULL AND c.deleted_at IS NULL
    )
  );

CREATE POLICY hearings_lawyer_insert ON hearings
  FOR INSERT
  WITH CHECK (
    app_role() = 'lawyer'
    AND EXISTS (
      SELECT 1 FROM stages s
      JOIN cases c ON c.id = s.case_id
      WHERE s.id = hearings.stage_id AND c.lawyer_id = app_uid()
        AND s.deleted_at IS NULL AND c.deleted_at IS NULL
    )
  );

CREATE POLICY hearings_lawyer_update ON hearings
  FOR UPDATE
  USING (
    app_role() = 'lawyer'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM stages s
      JOIN cases c ON c.id = s.case_id
      WHERE s.id = hearings.stage_id AND c.lawyer_id = app_uid()
        AND s.deleted_at IS NULL AND c.deleted_at IS NULL
    )
  );

CREATE POLICY hearings_viewer_select ON hearings
  FOR SELECT
  USING (
    app_role() = 'viewer'
    AND deleted_at IS NULL
  );


-- ── documents ───────────────────────────────────────

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

CREATE POLICY documents_admin_all ON documents
  FOR ALL
  USING (
    app_role() = 'admin'
    AND deleted_at IS NULL
  );

CREATE POLICY documents_lawyer_select ON documents
  FOR SELECT
  USING (
    app_role() = 'lawyer'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = documents.case_id AND c.lawyer_id = app_uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY documents_lawyer_insert ON documents
  FOR INSERT
  WITH CHECK (
    app_role() = 'lawyer'
    AND EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = documents.case_id AND c.lawyer_id = app_uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY documents_lawyer_delete ON documents
  FOR UPDATE
  USING (
    app_role() = 'lawyer'
    AND deleted_at IS NULL
    AND uploaded_by = app_uid()
    AND EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = documents.case_id AND c.lawyer_id = app_uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY documents_viewer_select ON documents
  FOR SELECT
  USING (
    app_role() = 'viewer'
    AND deleted_at IS NULL
  );


-- ── transfers ───────────────────────────────────────

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers FORCE ROW LEVEL SECURITY;

CREATE POLICY transfers_admin_all ON transfers
  FOR ALL
  USING (app_role() = 'admin');

CREATE POLICY transfers_lawyer_select ON transfers
  FOR SELECT
  USING (
    app_role() = 'lawyer'
    AND (from_id = app_uid() OR to_id = app_uid())
  );

CREATE POLICY transfers_lawyer_insert ON transfers
  FOR INSERT
  WITH CHECK (
    app_role() = 'lawyer'
    AND from_id = app_uid()
  );


-- ── parties (all users can read; only admin soft-deletes) ──

ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties FORCE ROW LEVEL SECURITY;

CREATE POLICY parties_anyone_select ON parties
  FOR SELECT
  USING (deleted_at IS NULL);

CREATE POLICY parties_admin_all ON parties
  FOR ALL
  USING (app_role() = 'admin');

CREATE POLICY parties_lawyer_insert ON parties
  FOR INSERT
  WITH CHECK (app_role() = 'lawyer');

CREATE POLICY parties_lawyer_update ON parties
  FOR UPDATE
  USING (app_role() = 'lawyer' AND deleted_at IS NULL);


-- ── notifications (user sees only own) ──────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_own ON notifications
  FOR ALL
  USING (user_id = app_uid());

CREATE POLICY notifications_admin_all ON notifications
  FOR ALL
  USING (app_role() = 'admin');


-- ── GRANT permissions to app_user ───────────────────

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;


-- Down Migration

-- Revoke grants
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_user;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_user;

-- Drop policies (CASCADE from table drops would also work)
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE parties       DISABLE ROW LEVEL SECURITY;
ALTER TABLE transfers     DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents     DISABLE ROW LEVEL SECURITY;
ALTER TABLE hearings      DISABLE ROW LEVEL SECURITY;
ALTER TABLE stages        DISABLE ROW LEVEL SECURITY;
ALTER TABLE cases         DISABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS app_role();
DROP FUNCTION IF EXISTS app_uid();
