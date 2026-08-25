-- ---------------------------------------------------------------------------
-- Development seed data.
--
-- Two demo accounts with appointments and one worked chat conversation, so the
-- UI has something realistic to render on a fresh database.
--
--   psql "$DATABASE_URL" -f database/seeds/seed.sql
--
-- The equivalent TypeScript seed (`npm run db:seed`) is usually more
-- convenient — it hashes passwords with the configured bcrypt cost and places
-- appointments relative to today rather than at fixed dates.
--
-- These are throwaway demo credentials for a local database. Never load this
-- file into a deployed environment.
--   demo@slotly.test  / DemoPassw0rd
--   sam@slotly.test   / DemoPassw0rd
-- ---------------------------------------------------------------------------

BEGIN;

-- Idempotent: re-running replaces the seeded rows rather than duplicating them.
DELETE FROM users WHERE email IN ('demo@slotly.test', 'sam@slotly.test');

-- bcrypt hash of 'DemoPassw0rd' (cost 12).
INSERT INTO users (id, name, email, password_hash) VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'Demo User',
    'demo@slotly.test',
    '$2a$12$Owq5Akvs.9dKhsiaoCSvrORgz6Kbza9wx9HWMP1Av8N9seyZeQ/dS'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Sam Rivera',
    'sam@slotly.test',
    '$2a$12$Owq5Akvs.9dKhsiaoCSvrORgz6Kbza9wx9HWMP1Av8N9seyZeQ/dS'
  );

-- ---------------------------------------------------------------------------
-- Appointments — dated relative to today so the "upcoming" view is never empty.
-- ---------------------------------------------------------------------------

INSERT INTO appointments
  (user_id, appointment_type, starts_at, ends_at, duration_minutes, timezone, notes, status, source)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'Dentist',
    (CURRENT_DATE + INTERVAL '1 day' + TIME '15:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '1 day' + TIME '15:30')::timestamptz,
    30, 'UTC', 'Routine check-up. Ask about the sensitivity on the left side.',
    'CONFIRMED', 'AI'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'Physiotherapy',
    (CURRENT_DATE + INTERVAL '3 days' + TIME '09:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '3 days' + TIME '10:00')::timestamptz,
    60, 'UTC', 'Bring the exercise sheet from last time.',
    'CONFIRMED', 'MANUAL'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'Haircut',
    (CURRENT_DATE + INTERVAL '6 days' + TIME '17:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '6 days' + TIME '18:00')::timestamptz,
    30, 'UTC', NULL,
    'PENDING', 'MANUAL'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'Eye test',
    (CURRENT_DATE - INTERVAL '9 days' + TIME '11:00')::timestamptz,
    (CURRENT_DATE - INTERVAL '9 days' + TIME '11:30')::timestamptz,
    30, 'UTC', NULL,
    'COMPLETED', 'MANUAL'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'Car service',
    (CURRENT_DATE - INTERVAL '2 days' + TIME '08:00')::timestamptz,
    (CURRENT_DATE - INTERVAL '2 days' + TIME '09:30')::timestamptz,
    90, 'UTC', 'Cancelled — rescheduling next month.',
    'CANCELLED', 'MANUAL'
  ),
  -- Belongs to the second account. Useful for confirming by hand that the demo
  -- user's API responses never include it.
  (
    '22222222-2222-4222-8222-222222222222',
    'Consultation',
    (CURRENT_DATE + INTERVAL '2 days' + TIME '14:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '2 days' + TIME '14:45')::timestamptz,
    45, 'UTC', 'Belongs to Sam, not to the demo user.',
    'CONFIRMED', 'MANUAL'
  );

-- ---------------------------------------------------------------------------
-- A completed chat conversation, matching the appointment booked by AI above.
-- ---------------------------------------------------------------------------

INSERT INTO chat_sessions (id, user_id, status, draft) VALUES
  (
    '33333333-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111',
    'COMPLETED',
    jsonb_build_object(
      'appointmentType', 'Dentist',
      'date', to_char(CURRENT_DATE + INTERVAL '1 day', 'YYYY-MM-DD'),
      'startTime', '15:00',
      'durationMinutes', 30,
      'notes', NULL,
      'timezone', 'UTC'
    )
  );

INSERT INTO chat_messages (session_id, role, content, created_at) VALUES
  ('33333333-3333-4333-8333-333333333333', 'ASSISTANT',
   'Hi — what would you like to book? Tell me the kind of appointment and when suits you.',
   NOW() - INTERVAL '20 minutes'),
  ('33333333-3333-4333-8333-333333333333', 'USER',
   'I want to book a dentist appointment tomorrow afternoon.',
   NOW() - INTERVAL '19 minutes'),
  ('33333333-3333-4333-8333-333333333333', 'ASSISTANT',
   'Sure. What time would you prefer?',
   NOW() - INTERVAL '19 minutes'),
  ('33333333-3333-4333-8333-333333333333', 'USER',
   '3 PM.',
   NOW() - INTERVAL '18 minutes'),
  ('33333333-3333-4333-8333-333333333333', 'ASSISTANT',
   'I have a dentist appointment tomorrow at 3:00 PM for 30 minutes. Should I confirm it?',
   NOW() - INTERVAL '18 minutes'),
  ('33333333-3333-4333-8333-333333333333', 'USER',
   'Yes.',
   NOW() - INTERVAL '17 minutes'),
  ('33333333-3333-4333-8333-333333333333', 'ASSISTANT',
   'Booked — your Dentist appointment is confirmed for tomorrow at 15:00.',
   NOW() - INTERVAL '17 minutes');

-- Metadata only: no prompts and no message content, matching what the
-- application itself records.
INSERT INTO ai_interactions
  (session_id, user_id, model, request_meta, response_meta, latency_ms, success)
VALUES
  (
    '33333333-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111',
    'mistral-small-latest',
    '{"provider":"mistral","turnCount":3,"historyTurns":2,"template":"system_prompt.jinja"}',
    '{"intent":"book_appointment","attempts":1,"finishReason":"stop","promptTokens":842,"completionTokens":96}',
    1180, TRUE
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111',
    'mistral-small-latest',
    '{"provider":"mistral","turnCount":5,"historyTurns":4,"template":"system_prompt.jinja"}',
    '{"intent":"confirm_appointment","attempts":1,"finishReason":"stop","promptTokens":915,"completionTokens":64}',
    964, TRUE
  );

COMMIT;
