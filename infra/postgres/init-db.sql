-- Creates non-superuser role for the application.
-- Migrations run as postgres (superuser); the app connects as app_user.
-- DEFAULT PRIVILEGES ensure tables created by postgres are accessible to app_user.
--
-- ВАЖНО: пароль должен совпадать с DATABASE_URL в .env

CREATE ROLE app_user WITH LOGIN PASSWORD '29203f28eb2d4028704444ea4151d86a5a0e0df2';
GRANT CONNECT ON DATABASE yurdelo TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
