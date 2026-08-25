# Slotly — AI Appointment Booking

A small SaaS application where a signed-in user books appointments two ways: by
describing what they want in plain language, or by filling in a form. Both
routes end up in the same place — one appointment service, one set of
scheduling rules, one path to the database.

The AI helps a user *express* a booking. It never performs one.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Local setup](#local-setup)
- [Database setup](#database-setup)
- [AI setup](#ai-setup)
- [API overview](#api-overview)
- [Security decisions](#security-decisions)
- [Architectural decisions and tradeoffs](#architectural-decisions-and-tradeoffs)
- [Indexing strategy](#indexing-strategy)
- [Testing](#testing)
- [Assumptions](#assumptions)
- [Known limitations](#known-limitations)
- [Future improvements](#future-improvements)

---

## What it does

- **Accounts** — register, sign in, sign out. Passwords are bcrypt-hashed; the
  session JWT is delivered as an HttpOnly cookie.
- **Dashboard** — two clearly-labelled booking routes plus what is coming up.
- **AI assistant** — a multi-turn conversation that collects the appointment
  type, date, time and duration, asks for whatever is missing, and presents a
  summary to confirm. The draft is visible beside the conversation the whole
  time, so the user can see exactly what will be booked.
- **Manual booking** — a short form with client-side and server-side validation.
- **Appointments** — upcoming/past/all, with cancellation.
- **Graceful degradation** — if Mistral is unreachable, the assistant says so
  and routes the user to the form. Booking never stops working because the AI
  is down.

### The conversation, end to end

```
User:      I want to book a dentist appointment tomorrow afternoon.
Assistant: Sure. What time would you prefer?
User:      3 PM.
Assistant: I have a dentist appointment on August 26 at 3:00 PM for 30 minutes.
           Should I confirm it?
User:      Yes.
           → backend re-validates the draft → appointment service → PostgreSQL
```

---

## Architecture

```mermaid
flowchart TD
    Browser["Browser"]

    subgraph Frontend["Next.js (App Router)"]
        Pages["Pages: auth · dashboard · assistant · form · appointments"]
        Services["services/ — typed API layer"]
        Query["TanStack Query — server state"]
    end

    subgraph Backend["Node + Express"]
        MW["Middleware: helmet · CORS · rate limit · auth · Zod validation"]
        Controllers["Controllers (thin)"]
        AppSvc["Appointment service — all scheduling rules"]
        ChatSvc["Chat service — conversation + draft state"]
        AISvc["AI service — prompts, parsing, validation"]
        Repos["Repositories — user-scoped Prisma queries"]
    end

    DB[("Supabase PostgreSQL")]
    Mistral[["Mistral API"]]

    Browser --> Pages --> Services --> Query
    Services -- "REST/JSON + cookie" --> MW --> Controllers
    Controllers --> AppSvc
    Controllers --> ChatSvc
    ChatSvc --> AISvc
    AISvc -. "prompt / structured output" .-> Mistral
    AISvc -- "validated draft" --> ChatSvc
    ChatSvc -- "confirmed booking" --> AppSvc
    AppSvc --> Repos --> DB

    style Mistral stroke-dasharray: 5 5
```

The dashed edge is the point of the whole design. Mistral sits at the end of a
branch, not in the middle of the path to the database.

### The rule that shapes everything

**The AI never creates, updates or deletes an appointment.**

```
User message
  → Chat API                (authenticated, rate-limited, validated)
  → AI service              (renders .jinja prompt, calls Mistral)
  → structured JSON output  (untrusted)
  → Zod validation          (strict; rejected output is retried once, then dropped)
  → server-held draft       (merged on the server, never on the client)
  → user confirms
  → Zod validation again    (the same schema the manual form uses)
  → appointment service     (past-date and overlap rules)
  → Prisma
  → PostgreSQL
```

The manual form joins at the `appointment service` step. Both flows are
validated by `createAppointmentSchema` and executed by
`appointmentService.create`, so a scheduling rule cannot exist in one flow and
not the other. There is no second code path to keep in sync.

Three specific consequences worth pointing out:

1. **The draft lives on the server** (`chat_sessions.draft`). The client cannot
   submit a doctored draft, and a model that "forgets" a detail on turn three
   cannot erase what the user said on turn one.
2. **The server's view wins.** If the model claims the user confirmed but the
   draft is still incomplete, the booking does not happen — the assistant asks
   for the missing detail instead. This is covered by a test.
3. **Structured output is validated, not repaired.** Formatting the model gets
   wrong (`3pm`, `"null"`, snake_case keys) is normalised. Facts it gets wrong
   (`"next tuesday"` as a date, a 1000-minute duration) are rejected, so the
   assistant asks again rather than booking a guess.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Server state | TanStack Query |
| Forms | React Hook Form + Zod |
| Backend | Node.js, Express, TypeScript |
| Validation | Zod (requests, query params, route params, AI output) |
| Auth | JWT in an HttpOnly cookie, bcrypt |
| ORM | Prisma |
| Database | PostgreSQL (Supabase) |
| AI | Mistral (`mistral-small-latest`) behind a provider interface |
| Prompts | Jinja templates rendered server-side with Nunjucks |
| Logging | Pino + pino-http, with redaction |
| Tests | Vitest + Supertest |

---

## Local setup

**Prerequisites:** Node.js 20+, a PostgreSQL database (Supabase or local), and
a Mistral API key.

```bash
git clone <your-repo-url>
cd appointment-ai
npm install          # installs both workspaces
```

### 1. Configure the backend

```bash
cp .env.example backend/.env
```

Fill in `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
JWT_SECRET=<openssl rand -base64 48>
MISTRAL_API_KEY=<your key>
FRONTEND_URL=http://localhost:3000
```

`JWT_SECRET` must be at least 32 characters — the server refuses to start
otherwise, rather than falling back to a weak default.

### 2. Configure the frontend

```bash
echo 'NEXT_PUBLIC_API_URL=http://localhost:4000' > frontend/.env.local
```

### 3. Create the schema and seed it

```bash
npm run db:migrate --workspace=backend   # or db:push for a throwaway database
npm run db:seed --workspace=backend
```

### 4. Run

```bash
npm run dev            # both, or:
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:3000
```

Sign in with the seeded account:

```
demo@slotly.test / DemoPassw0rd
```

Check the API is healthy — this also reports whether the AI is configured:

```bash
curl http://localhost:4000/api/health
```

### Optional: local Postgres instead of Supabase

```bash
docker compose up -d
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/appointment_ai
```

---

## Database setup

Prisma owns the schema. `backend/prisma/schema.prisma` is the source of truth,
and `npm run db:migrate` generates versioned SQL migrations from it.

`database/migrations/001_initial_schema.sql` is the same schema written as plain
SQL, for review, for provisioning by hand, or to paste into the Supabase SQL
editor. `database/seeds/seed.sql` mirrors the TypeScript seed. The TypeScript
seed is the one to prefer — it hashes passwords at the configured cost and dates
appointments relative to today, so the "upcoming" view is never empty.

To apply the SQL migration directly against Supabase without `psql` installed,
Prisma can run the file for you:

```bash
npx prisma db execute --url "$DATABASE_URL" \
  --file ../database/migrations/001_initial_schema.sql
```

### Supabase connection strings

Supabase offers three, and the difference matters:

- **Direct** — `db.<ref>.supabase.co:5432`. **This host resolves to IPv6 only.**
  On an IPv4-only network it is simply unreachable, and Prisma reports it as
  "Can't reach database server", which reads like a credentials or firewall
  problem and is not. Confirm with `dig +short A db.<ref>.supabase.co` — an
  empty result means there is no IPv4 address to connect to. Supabase sells an
  IPv4 add-on; the free fix is the pooler below.
- **Session pooler** — `aws-0-<region>.pooler.supabase.com:5432`, username
  `postgres.<ref>`. Reachable over IPv4, holds a dedicated connection for the
  session, and supports prepared statements and migrations. **This is what this
  project uses**, and what `DATABASE_URL` should be for a long-lived Node
  process.
- **Transaction pooler** — same host on port `6543`. For serverless runtimes,
  with `?pgbouncer=true&connection_limit=1`. Prisma migrations cannot run
  through it: transaction-mode pooling does not support the advisory locks they
  need.

The `<region>` is your project's AWS region, shown in the Supabase dashboard
under Project Settings → Database.

Supabase is used here purely as hosted PostgreSQL. Its client SDK, Auth and
Row Level Security are deliberately not used — see the tradeoffs below.

### Tables

| Table | Purpose |
| --- | --- |
| `users` | Accounts. Unique email, bcrypt hash. |
| `appointments` | Bookings. UTC instants plus the IANA zone they were booked in. |
| `chat_sessions` | One conversation, with the server-held booking `draft`. |
| `chat_messages` | Transcript. Assistant turns carry their validated structured output. |
| `ai_interactions` | Model call telemetry: latency, tokens, outcome. Metadata only. |

---

## AI setup

1. Create a key at [console.mistral.ai](https://console.mistral.ai/api-keys).
2. Put it in `backend/.env` as `MISTRAL_API_KEY`.
3. Restart the backend.

The key is read only by the server. It is never sent to the browser, never
included in an API response, and never written to a log.

**Without a key the app still works.** `/api/health` reports
`ai: "not_configured"`, the assistant screen shows *"AI booking is temporarily
unavailable"* with a link to the form, and manual booking is unaffected.

### Prompts

Prompts live in `backend/src/prompts/` as `.jinja` templates, rendered with
Nunjucks:

| Template | Role |
| --- | --- |
| `system_prompt.jinja` | The assistant's brief: scope, the four fields, the output contract, and the rules (never invent a detail, never claim something is booked). |
| `appointment_extraction.jinja` | A short reminder appended to the last turn, to hold the format over a long conversation. |
| `clarification.jinja` | Deterministic fallback copy, rendered with no model involved at all. |

Dynamic context — the current date and weekday in the user's timezone, the
running draft, what is still missing — is injected as template *variables*, not
concatenated into the template source.

`clarification.jinja` is worth a mention: when the model is unavailable or its
output is unusable, the user still gets a coherent reply. That copy is rendered
from a template rather than hardcoded in a `catch` block, which keeps every
user-visible assistant message in one reviewable place.

Prompts are treated as server-side application assets: version-controlled and
editable without touching TypeScript, but not secrets, and never served to the
browser.

---

## API overview

All responses share one envelope.

```jsonc
// success
{ "success": true, "data": { /* ... */ } }

// failure
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted data is invalid",
    "details": [{ "field": "startTime", "message": "Time must be in 24-hour HH:mm format" }]
  }
}
```

### Authentication

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Sets the session cookie. `201`, or `409 EMAIL_TAKEN`. |
| `POST` | `/api/auth/login` | `401 INVALID_CREDENTIALS` — identical for unknown email and wrong password. |
| `GET` | `/api/auth/me` | Current user. `401` when the cookie is absent or invalid. |
| `POST` | `/api/auth/logout` | Clears the cookie. |

### Appointments

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/appointments` | `201`. `409 APPOINTMENT_CONFLICT` on overlap, `400` for a past date. |
| `GET` | `/api/appointments` | `?scope=upcoming\|past\|all&status=&from=&to=&limit=&offset=` |
| `GET` | `/api/appointments/:id` | `404` if it is not yours. |
| `PATCH` | `/api/appointments/:id` | Reschedule, edit or change status. Re-checks overlaps. |
| `DELETE` | `/api/appointments/:id` | `204`. |

### Chat

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/chat/sessions` | Starts a conversation. |
| `GET` | `/api/chat/sessions` | Your sessions. |
| `GET` | `/api/chat/sessions/:id` | Transcript, draft, and what is missing. |
| `POST` | `/api/chat/sessions/:id/messages` | One turn. Returns the reply, the updated draft, and any appointment created by an in-conversation confirmation. |
| `POST` | `/api/chat/sessions/:id/confirm` | Promotes the server-held draft. This is what the summary card's button calls. |

### Health

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | Database reachability and whether the AI is configured. `503` when the database is down. |

Status codes used: `200`, `201`, `204`, `400`, `401`, `404`, `409`, `429`,
`500`, `502` (unusable model output), `503` (AI unavailable).

---

## Security decisions

**Passwords** — bcrypt at cost 12. Plaintext is never stored, logged, or
returned. Login compares against a dummy hash when no user matches, so a
missing account and a wrong password take the same time and return the same
error; neither can be used to enumerate registered addresses.

**Sessions** — a JWT in an `HttpOnly`, `SameSite`-scoped, `Secure`-in-production
cookie. It is never in a response body, so there is no token in `localStorage`
for an XSS to steal. `SameSite` is configurable because a cross-domain
deployment needs `None; Secure` while local development works with `Lax`.

**Authorization** — enforced in the repository layer, where every query carries
its `userId` predicate. Updates and deletes use `updateMany`/`deleteMany` with
the ownership predicate applied atomically, so there is no
check-then-act window. Fetching someone else's resource returns **404, not
403**, so a response cannot confirm that an id exists. Tested from both sides
for appointments and chat sessions.

**Input validation** — Zod on every request body, query string and route param.
The parsed result *replaces* the raw input, so unknown keys a client sends can
never reach a service or Prisma. Client-side validation exists for feedback
only; the server re-validates everything.

**AI output** — treated exactly like user input. Strict schema, one corrective
retry, then abandoned. The model has no database access, no tools, and no way
to trigger a write; the only thing it can influence is a draft that a human
confirms and the server re-validates. The system prompt also instructs it to
treat user text as information rather than instructions.

**Rate limiting** — tiered by what is actually at risk: auth `10/15min`
(credential stuffing), AI turns `15/min` (each one costs money upstream),
writes `40/min`, everything else `300/min`. Authenticated callers are keyed by
user id so people behind a shared IP do not consume each other's budget.

**SQL injection** — Prisma parameterises everything. The one raw statement is
the test-suite `TRUNCATE`, which takes no user input. A test asserts that
`"Dentist'; DROP TABLE appointments; --"` is stored as ordinary text.

**Secrets** — server-side environment variables only, validated at boot; the
process exits if `JWT_SECRET` is too short or `DATABASE_URL` is missing. The
frontend's only configuration is the API URL, which is not a secret. `.env` is
git-ignored, `.env.example` holds placeholders.

**Logging** — method, path, status, duration and a correlation id. Never
bodies, cookies or headers. Pino redaction scrubs `authorization`, `cookie`,
`password`, `token` and `apiKey` paths as a second line of defence. AI
telemetry records latency, tokens, intent and outcome — never prompts or
message content, which a test asserts.

**Error responses** — one handler, one shape. Unexpected errors are logged in
full server-side and returned as a bare 500; stack traces, Prisma messages and
upstream API bodies never cross the wire in production.

**Headers** — Helmet, an explicit CORS allowlist (a reflected origin with
credentials enabled would be a CSRF primitive), a 100 KB body cap, and
`x-powered-by` disabled.

---

## Architectural decisions and tradeoffs

**Next.js frontend, separate Express API.** Next.js Route Handlers could have
hosted the API in one process. Two reasons not to: the assessment asks for a
demonstrable Express backend, and a standalone API keeps the layering
(route → middleware → controller → service → repository) explicit and testable
with Supertest without a Next.js runtime. The cost is CORS configuration and
two processes in development.

**Supabase for PostgreSQL only.** No Supabase client in the browser, no Auth,
no Row Level Security. Mixing RLS with an application-tier authorization model
means two places to get authorization right, and a frontend holding database
credentials — even anon ones — widens the surface for no gain here. Supabase
provides a managed Postgres with backups and a good free tier; the app talks to
it over a standard connection string, and moving to RDS or Neon would be a
one-line change. The tradeoff: no realtime subscriptions, which this MVP does
not need.

**Prisma.** Type-safe queries derived from the schema, parameterised by
construction, with versioned migrations. The generated types flow into the
service layer, so a schema change surfaces as a compile error rather than a
runtime one. It is heavier than a query builder and its connection pooling
needs care on serverless — noted in the setup section.

**Request/response chat, not WebSockets.** The interaction is strictly
turn-based: one message in, one reply out, with no server-initiated events and
no other participants. A socket layer would add connection lifecycle,
reconnection and auth-handshake complexity to buy nothing a `POST` does not
already provide. Responsiveness comes from optimistic rendering of the user's
own message and a typing indicator while the reply is in flight. Streaming
tokens is the change that would actually improve this, and that is a natural
next step — it needs SSE, not WebSockets.

**The AI is isolated behind a service.** `AiService` depends on an `AiProvider`
interface; `MistralProvider` is the only implementation. Nothing outside that
folder knows Mistral exists. That makes the provider swappable, and it makes
the entire conversation pipeline testable with a scripted stub — no API key, no
network, no flakiness in CI.

**Prompts as `.jinja` templates.** Prompts change far more often than
application code and are edited by people reasoning about wording, not
TypeScript. Keeping them as separate files means a prompt change is a
reviewable diff of the prompt itself, dynamic context arrives as structured
variables rather than string concatenation, and the fallback copy shown when
the model fails lives in the same place as the rest.

**One appointment service for both flows.** The alternative — letting the chat
service create appointments directly — would duplicate the past-date check, the
overlap check and the timezone conversion, and the two copies would drift.
Instead the AI draft is normalised into the same `CreateAppointmentInput` the
form produces and validated by the same schema. Every scheduling rule is
enforced once.

**UTC instants plus a stored timezone.** A date and a time are meaningless
without a zone, and a bare UTC timestamp cannot reproduce the local wall-clock
time the user actually chose across a DST boundary. Storing both means
"15:00 in Karachi" survives a round trip exactly. The conversion is a small
`Intl`-based utility rather than a date library — tested against fixed-offset
zones, DST zones in both seasons, and a spring-forward boundary.

---

## Indexing strategy

Indexes follow the queries the application actually issues.

| Index | Serves |
| --- | --- |
| `users(email)` unique | Login lookup, and the uniqueness constraint itself. |
| `appointments(user_id, starts_at)` | "My upcoming appointments" and the overlap check on every write — both filter by user and range on time. |
| `appointments(user_id, status)` | Status filtering on the appointments page. |
| `appointments(starts_at)` | Cross-user time queries (reminder sweeps, availability) — not needed yet, cheap to keep. |
| `chat_sessions(user_id, updated_at)` | Listing a user's conversations, most recent first. |
| `chat_messages(session_id, created_at)` | Loading a transcript in order, which is the only way it is ever read. |
| `ai_interactions(session_id, created_at)` | Tracing the model calls behind one conversation. |
| `ai_interactions(created_at)` | Time-ordered latency and error-rate reporting. |

Composite indexes lead with the equality column and end with the range column,
so one index serves both the filter and the ordering. At MVP data volumes
almost any indexing would perform acceptably; these are chosen so the access
patterns stay correct as the tables grow, and no further optimisation has been
attempted.

---

## Testing

```bash
npm test --workspace=backend
```

Integration tests need a PostgreSQL database. Point `TEST_DATABASE_URL` at a
**throwaway** one — the suite truncates tables between tests.

```bash
docker compose up -d
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/appointment_ai_test \
  npm test --workspace=backend
```

What is covered:

- **Auth** — registration, duplicate email (including case differences),
  password policy, login, wrong password, unknown email returning an identical
  error, cookie flags, tampered tokens, and that no hash or token appears in a
  response body.
- **Authorization** — for every protected resource, the owner succeeds and a
  second user gets 404; writes by a non-owner leave the row untouched.
- **Appointments** — creation, timezone conversion to the right UTC instant,
  past-date rejection, overlap detection, back-to-back bookings allowed, two
  users holding the same slot, unknown fields stripped, rescheduling,
  cancellation, deletion, invalid ids and a SQL injection attempt.
- **AI** — a complete request, a missing time, an ambiguous "book me whenever",
  detail carried across turns, malformed output retried then abandoned, JSON in
  a code fence, a hallucinated date rejected, provider failure degrading to the
  form, telemetry recorded without message content, and the model's claimed
  confirmation being overridden when the server-side draft is incomplete.
- **Time** — fixed-offset zones, DST zones in both seasons, a spring-forward
  boundary, round trips, and validator edge cases.

The AI tests run against a scripted provider stub, so they are deterministic
and need no API key.

For walking the product by hand — sample conversations for each behaviour,
curl recipes, and how to break the AI on purpose to see the fallback — see
[TESTING.md](TESTING.md).

---

## Assumptions

- **One calendar per user.** No providers, staff or resources to schedule
  against — an appointment belongs to the user who booked it, and "availability"
  means "this user has nothing else then".
- **No business hours.** Any future time is bookable. Real availability rules
  are a product decision, not an MVP one.
- **Bookings are personal**, so a user overlapping themselves is an error worth
  blocking, while two users at the same time is fine.
- **Duration defaults to 30 minutes** when the user does not say. The assistant
  offers it rather than interrogating them about it.
- **The browser's timezone is authoritative** for what the user meant. It is
  sent explicitly rather than inferred server-side.
- **English-language conversation.**
- **Session length is 7 days**, with no refresh-token rotation.

## Known limitations

This is an MVP built to demonstrate architecture, not a production system.

- **No refresh tokens or revocation.** A stolen cookie is valid until it
  expires; there is no server-side session store to revoke against.
- **No CSRF token.** Cookie auth is protected by `SameSite` and a strict CORS
  allowlist, which covers the realistic cases here, but a defence-in-depth
  system would add a double-submit token.
- **Rate limiting is in-process.** Multiple instances each get their own
  budget. A shared store is the fix, and is deliberately out of scope.
- **No email verification or password reset.**
- **Appointment status does not advance on its own** — nothing moves a past
  appointment to `COMPLETED` without a scheduled job.
- **Conversation history is truncated to the last 12 turns.** Long enough for a
  booking, but the assistant will forget the start of a very long conversation.
- **"Next Friday" is resolved inconsistently.** Dates are not left to the model:
  the prompt is given a precomputed calendar and a weekday-to-date lookup, which
  took measured accuracy on relative dates from 4/9 to 8/9 across repeated live
  runs. The residual failure is `next <weekday>`, which is genuinely ambiguous
  in English — this week's Friday or next week's. The consequence is contained
  by design: the resolved date is shown in the summary panel and in the
  assistant's own confirmation question, and nothing is written until the user
  confirms. A dropdown of resolved candidate dates would remove it entirely.
- **The AI reply is not streamed**, so a slow model call shows a typing
  indicator for its full duration.
- **No observability beyond logs.** No metrics, tracing or alerting.
- **Frontend tests are not included.** Backend logic and boundaries were the
  higher-value place to spend the testing budget.

## Future improvements

- **Streaming responses** over SSE, so the assistant's reply appears as it is
  generated.
- **Availability management** — business hours, buffers between appointments,
  blackout dates, bookable resources.
- **Calendar integration** — two-way sync with Google Calendar or CalDAV.
- **Reminders** — email or SMS, on a scheduled job.
- **Multi-tenancy** — a `businesses` table and a `business_id` on users and
  appointments, with the existing composite indexes extended to lead with it.
  No table would need restructuring: every query already scopes by owner in the
  repository layer, so tenancy becomes an additional predicate in one place
  rather than an audit of the whole codebase.
- **Shared rate limiting** and a revocable session store.
- **Observability** — metrics, tracing, and alerting on the AI error rate and
  latency already recorded in `ai_interactions`.
- **Prompt evaluation** — a regression suite of conversations checked against
  expected extractions, so a prompt edit cannot silently degrade behaviour.
# Slotly_ai-appointment-booking
