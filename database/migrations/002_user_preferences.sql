-- ---------------------------------------------------------------------------
-- 002 — User booking preferences
--
-- Adds the two settings the account screen exposes. Both are fallbacks used
-- when a request does not state a value of its own, so they apply to the manual
-- form and to anything the assistant books.
--
-- Defaults match the constants they replace (UTC, 30 minutes), so existing rows
-- keep the behaviour they had before this migration.
--
-- Apply with:
--   psql "$DATABASE_URL" -f database/migrations/002_user_preferences.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS default_duration_minutes INTEGER NOT NULL DEFAULT 30;

-- The application constrains this to 15–480 on a five-minute grid; the check
-- keeps a hand-written UPDATE from putting a nonsensical value in front of the
-- booking pipeline.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_default_duration_minutes_check;

ALTER TABLE users
  ADD CONSTRAINT users_default_duration_minutes_check
  CHECK (default_duration_minutes BETWEEN 15 AND 480);

COMMIT;
