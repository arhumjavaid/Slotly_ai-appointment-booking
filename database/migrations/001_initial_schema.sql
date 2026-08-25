-- ---------------------------------------------------------------------------
-- Appointment AI — canonical schema
--
-- Prisma migrations are the source of truth for the running application; this
-- file is the same schema expressed as plain SQL, for reviewing the design, for
-- provisioning a database by hand, and for running directly in the Supabase SQL
-- editor.
--
-- Apply with:
--   psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
-- ---------------------------------------------------------------------------

BEGIN;

-- gen_random_uuid() lives here on Postgres 12; built in from 13 onward.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AppointmentSource" AS ENUM ('MANUAL', 'AI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ChatSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  -- bcrypt output. Plaintext passwords are never stored or logged.
  password_hash VARCHAR(255)  NOT NULL,
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- Enforces one account per address and backs the login lookup, which is on the
-- hot path for every sign-in.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email);

-- ---------------------------------------------------------------------------
-- appointments
--
-- starts_at / ends_at are UTC instants; `timezone` records the IANA zone the
-- booking was made in so the original local wall-clock time can be reproduced
-- exactly, including across DST boundaries.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  appointment_type VARCHAR(120) NOT NULL,
  starts_at        TIMESTAMPTZ(6) NOT NULL,
  ends_at          TIMESTAMPTZ(6) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  timezone         VARCHAR(64) NOT NULL DEFAULT 'UTC',
  notes            VARCHAR(1000),
  status           "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
  -- Whether this came from the form or the assistant. Useful for measuring how
  -- much of the product the AI path actually carries.
  source           "AppointmentSource" NOT NULL DEFAULT 'MANUAL',
  created_at       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT appointments_duration_positive CHECK (duration_minutes BETWEEN 15 AND 480),
  CONSTRAINT appointments_ends_after_starts CHECK (ends_at > starts_at)
);

-- Serves the two dominant reads — "my upcoming appointments" and the overlap
-- check on write — both of which filter by user and order/range on time.
CREATE INDEX IF NOT EXISTS appointments_user_id_starts_at_idx ON appointments (user_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_user_id_status_idx ON appointments (user_id, status);
-- Supports future cross-user queries (reminder sweeps, availability).
CREATE INDEX IF NOT EXISTS appointments_starts_at_idx ON appointments (starts_at);

-- ---------------------------------------------------------------------------
-- chat_sessions
--
-- `draft` holds the server's accumulated view of the booking under discussion.
-- Keeping it here rather than on the client is what stops a tampered payload,
-- or a model that contradicts itself, from changing what gets booked.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status     "ChatSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  draft      JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_sessions_user_id_updated_at_idx
  ON chat_sessions (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
  role       "ChatRole" NOT NULL,
  content    TEXT NOT NULL,
  -- Validated structured output for assistant turns, so the confirmation card
  -- can be rebuilt when a conversation is reloaded.
  structured JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- Transcripts are always read as "this session, in order".
CREATE INDEX IF NOT EXISTS chat_messages_session_id_created_at_idx
  ON chat_messages (session_id, created_at);

-- ---------------------------------------------------------------------------
-- ai_interactions
--
-- Debugging and analytics for model calls. Deliberately metadata only: no
-- prompts, no message bodies, nothing a user typed.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_interactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES chat_sessions (id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users (id) ON DELETE SET NULL,
  model         VARCHAR(80) NOT NULL,
  request_meta  JSONB,
  response_meta JSONB,
  latency_ms    INTEGER NOT NULL,
  success       BOOLEAN NOT NULL DEFAULT TRUE,
  error_code    VARCHAR(64),
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_interactions_session_id_created_at_idx
  ON ai_interactions (session_id, created_at);
-- Time-ordered scans for latency and error-rate reporting.
CREATE INDEX IF NOT EXISTS ai_interactions_created_at_idx ON ai_interactions (created_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
--
-- Prisma sets updated_at on its own writes; this trigger keeps the column
-- honest for anything that reaches the database another way.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['users', 'appointments', 'chat_sessions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_%1$s_updated_at ON %1$s', target);
    EXECUTE format(
      'CREATE TRIGGER set_%1$s_updated_at BEFORE UPDATE ON %1$s
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      target
    );
  END LOOP;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Multi-tenancy note
--
-- Turning this into a multi-tenant SaaS means adding a `businesses` table and a
-- `business_id` column to users and appointments, then extending the existing
-- composite indexes to lead with it — e.g.
--   (business_id, user_id, starts_at)
-- No table would need restructuring, because every query already scopes by
-- owner in the repository layer rather than filtering in application code.
-- ---------------------------------------------------------------------------
