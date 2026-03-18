-- Up Migration

ALTER TABLE notifications ADD COLUMN link VARCHAR(500);

-- Down Migration

ALTER TABLE notifications DROP COLUMN IF EXISTS link;
