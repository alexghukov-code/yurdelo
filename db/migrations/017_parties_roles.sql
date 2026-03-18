-- Up Migration
-- Add plaintiff/defendant boolean flags to parties

ALTER TABLE parties ADD COLUMN is_plaintiff BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE parties ADD COLUMN is_defendant BOOLEAN NOT NULL DEFAULT true;

-- Down Migration

ALTER TABLE parties DROP COLUMN IF EXISTS is_defendant;
ALTER TABLE parties DROP COLUMN IF EXISTS is_plaintiff;
