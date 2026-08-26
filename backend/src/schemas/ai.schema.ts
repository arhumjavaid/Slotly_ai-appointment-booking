import { z } from 'zod';
import { isValidDateString } from '../utils/time';

/**
 * Contract for the model's structured output.
 *
 * Everything the model returns is untrusted input. The pipeline is:
 *   raw JSON -> normalise (shape-level tidying only) -> strict Zod parse
 * A failure at the Zod step is a hard failure: we retry once, then fall back to
 * the manual form. Nothing unvalidated ever reaches the appointment service.
 */

export const AI_INTENTS = [
  'book_appointment',
  'confirm_appointment',
  'cancel_booking_flow',
  'check_availability',
  'ask_question',
  'out_of_scope',
  'unclear',
] as const;

export const APPOINTMENT_FIELDS = [
  'appointmentType',
  'date',
  'startTime',
  'durationMinutes',
] as const;

export type AppointmentField = (typeof APPOINTMENT_FIELDS)[number];

const nullableTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .nullable()
    .catch(null);

const aiDateSchema = z
  .string()
  .refine(isValidDateString, 'Date must be YYYY-MM-DD')
  .nullable();

const aiTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm')
  .nullable();

export const aiAppointmentDraftSchema = z.object({
  appointmentType: nullableTrimmedString(120),
  date: aiDateSchema,
  startTime: aiTimeSchema,
  durationMinutes: z.number().int().min(15).max(480).nullable(),
  notes: nullableTrimmedString(1000),
});

export const aiExtractionSchema = z.object({
  intent: z.enum(AI_INTENTS),
  reply: z.string().trim().min(1).max(2000),
  appointment: aiAppointmentDraftSchema,
  // Treated as a hint only — the backend recomputes what is actually missing.
  missingFields: z.array(z.string().max(40)).max(10).catch([]),
  needsClarification: z.boolean().catch(true),
});

export type AiExtraction = z.infer<typeof aiExtractionSchema>;
export type AiAppointmentDraft = z.infer<typeof aiAppointmentDraftSchema>;

/** Draft accumulated on the server across conversation turns. */
export const storedDraftSchema = aiAppointmentDraftSchema.extend({
  timezone: z.string().max(64).nullable().catch(null),
});

export type StoredDraft = z.infer<typeof storedDraftSchema>;

export const emptyDraft = (timezone: string): StoredDraft => ({
  appointmentType: null,
  date: null,
  startTime: null,
  durationMinutes: null,
  notes: null,
  timezone,
});

const TIME_12H_RE = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i;

function normaliseTime(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // "15:00:00" -> "15:00"
  const withSeconds = /^(\d{2}:\d{2}):\d{2}$/.exec(trimmed);
  if (withSeconds) return withSeconds[1];

  // "3pm" / "3:30 PM" -> "15:00" / "15:30"
  const twelveHour = TIME_12H_RE.exec(trimmed);
  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    const minute = twelveHour[2] ?? '00';
    const meridiem = (twelveHour[3] ?? '').toLowerCase();
    if (hour === 12) hour = 0;
    if (meridiem === 'p') hour += 12;
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  // "9:05" -> "09:05"
  const shortHour = /^(\d):(\d{2})$/.exec(trimmed);
  if (shortHour) return `0${shortHour[1]}:${shortHour[2]}`;

  return trimmed;
}

function normaliseNullish(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '' || /^(null|none|n\/a|unknown|undefined)$/i.test(trimmed)) return null;
  return trimmed;
}

function toNumberOrNull(value: unknown): unknown {
  const cleaned = normaliseNullish(value);
  if (cleaned === null) return null;
  if (typeof cleaned === 'number') return cleaned;
  if (typeof cleaned === 'string') {
    const digits = /(\d+)/.exec(cleaned);
    if (digits) return Number(digits[1]);
  }
  return cleaned;
}

/**
 * Shape-level tidying of a raw model response before validation.
 *
 * This deliberately only fixes *formatting* the model gets wrong (casing,
 * "null" strings, 12-hour clocks). It never invents or defaults a value —
 * a missing time stays missing so the assistant has to ask for it.
 */
export function normaliseAiOutput(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const source = raw as Record<string, unknown>;

  const appointmentSource =
    (source.appointment as Record<string, unknown> | undefined) ??
    // Tolerate a flattened response where fields sit at the top level.
    source;

  const pick = (...keys: string[]): unknown => {
    for (const key of keys) {
      if (appointmentSource[key] !== undefined) return appointmentSource[key];
    }
    return null;
  };

  return {
    intent: normaliseNullish(source.intent) ?? 'unclear',
    reply: normaliseNullish(source.reply ?? source.message) ?? '',
    appointment: {
      appointmentType: normaliseNullish(pick('appointmentType', 'appointment_type', 'type')),
      date: normaliseNullish(pick('date', 'appointment_date')),
      startTime: normaliseTime(normaliseNullish(pick('startTime', 'start_time', 'time'))),
      durationMinutes: toNumberOrNull(pick('durationMinutes', 'duration_minutes', 'duration')),
      notes: normaliseNullish(pick('notes', 'note')),
    },
    missingFields: source.missingFields ?? source.missing_fields ?? [],
    needsClarification: source.needsClarification ?? source.needs_clarification ?? false,
  };
}
