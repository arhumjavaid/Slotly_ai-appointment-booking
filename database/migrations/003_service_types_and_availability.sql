-- ---------------------------------------------------------------------------
-- 003 — Service types and availability
--
-- Until now the bookable services were a hardcoded array in the frontend and
-- `appointments.appointment_type` was unconstrained free text, so every future
-- time was bookable and the assistant had no facts to reason from.
--
-- This adds the catalogue and its opening hours. Two design notes:
--
--   * Rules describe OPEN WINDOWS, never breaks. A doctor working 09:00-12:00
--     and 14:00-18:00 is two rows for that weekday, and the two-hour break is
--     simply the gap between them. A closed day is zero rows. An appointment
--     must fit inside a single window, which is what gives the break meaning.
--     No break table, no special cases.
--
--   * `appointments` is deliberately untouched. Matching an appointment to a
--     service happens in the application by name, so existing rows stay valid
--     and a booking whose type matches nothing in this catalogue keeps working
--     exactly as before. See the note at the foot of this file.
--
-- Apply with:
--   psql "$DATABASE_URL" -f database/migrations/003_service_types_and_availability.sql
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- service_types
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_types (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tenancy anchor, unused while the app is single-tenant. Kept nullable so
  -- the catalogue can later be partitioned per business without a rewrite.
  business_id              UUID NULL,
  name                     VARCHAR(120) NOT NULL,
  -- Lowercase, hyphenated. The application matches user phrasing against this,
  -- so it is the stable identity while `name` is free to be re-worded.
  slug                     VARCHAR(120) NOT NULL,
  default_duration_minutes INTEGER NOT NULL DEFAULT 30,
  active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT service_types_duration_range CHECK (default_duration_minutes BETWEEN 15 AND 480)
);

-- Globally unique while there is one business. Under multi-tenancy this
-- becomes UNIQUE (business_id, slug).
CREATE UNIQUE INDEX IF NOT EXISTS service_types_slug_key ON service_types (slug);

-- The catalogue is read on nearly every booking and on the availability
-- screen, and is only ever filtered by whether the service is bookable.
CREATE INDEX IF NOT EXISTS service_types_active_idx ON service_types (active);

-- ---------------------------------------------------------------------------
-- availability_rules
--
-- One row per open window per weekday. `starts_at`/`ends_at` are wall-clock
-- times, not instants: opening hours repeat every week and do not shift with
-- the calendar. The application resolves them against a concrete date when it
-- checks a booking.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS availability_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id UUID NOT NULL REFERENCES service_types (id) ON DELETE CASCADE,
  -- 0 = Sunday .. 6 = Saturday, matching JavaScript's getDay().
  weekday         SMALLINT NOT NULL,
  starts_at       TIME NOT NULL,
  ends_at         TIME NOT NULL,
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT availability_rules_weekday_range CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT availability_rules_ends_after_starts CHECK (ends_at > starts_at),
  -- Two windows on the same day cannot start at the same minute. Not full
  -- overlap detection — that needs an exclusion constraint — but it stops the
  -- obvious duplicate.
  CONSTRAINT availability_rules_no_duplicate UNIQUE (service_type_id, weekday, starts_at)
);

-- The only read pattern: "which windows does this service have on this day".
-- Equality on both columns, so a plain composite index covers it exactly.
CREATE INDEX IF NOT EXISTS availability_rules_service_weekday_idx
  ON availability_rules (service_type_id, weekday);

-- ---------------------------------------------------------------------------
-- updated_at maintenance for the new table
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_service_types_updated_at ON service_types;

CREATE TRIGGER set_service_types_updated_at
  BEFORE UPDATE ON service_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- ---------------------------------------------------------------------------
-- Why appointments has no service_type_id
--
-- A foreign key would be the stricter model, and is the right next step. It is
-- omitted here for two reasons worth stating rather than hiding:
--
--   * `appointment_type` is a historical label. Renaming "Doctor" to "General
--     Practitioner" must not rewrite what past users actually booked, so the
--     text column would have to survive the FK anyway.
--
--   * Enforcement is permissive by design at this stage: a type that matches a
--     service is held to that service's hours, and one that matches nothing is
--     booked as before. A NOT NULL FK would make every unmatched booking an
--     error, which is a product decision this prototype has not taken.
-- ---------------------------------------------------------------------------
