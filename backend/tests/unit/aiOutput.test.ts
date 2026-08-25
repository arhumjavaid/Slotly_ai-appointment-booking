import { describe, expect, it } from 'vitest';
import { aiExtractionSchema, normaliseAiOutput } from '../../src/schemas/ai.schema';

/**
 * The trust boundary around model output.
 *
 * Normalisation may only tidy *formatting*. Anything the model gets factually
 * wrong — an invented date, an out-of-range duration, an unknown intent — has
 * to be rejected rather than repaired, so the assistant asks again instead of
 * booking something the user never said.
 */
function parse(raw: unknown) {
  return aiExtractionSchema.safeParse(normaliseAiOutput(raw));
}

const base = {
  intent: 'book_appointment',
  reply: 'Got it.',
  appointment: {
    appointmentType: 'Dentist',
    date: '2026-08-25',
    startTime: '15:00',
    durationMinutes: 30,
    notes: null,
  },
  missingFields: [],
  needsClarification: false,
};

describe('AI output validation', () => {
  it('accepts a well-formed response', () => {
    const result = parse(base);
    expect(result.success).toBe(true);
    expect(result.success && result.data.appointment.startTime).toBe('15:00');
  });

  describe('formatting the model gets wrong is normalised', () => {
    it.each([
      ['3pm', '15:00'],
      ['3:30 PM', '15:30'],
      ['9:05', '09:05'],
      ['15:00:00', '15:00'],
      ['12am', '00:00'],
      ['12pm', '12:00'],
    ])('reads %s as %s', (input, expected) => {
      const result = parse({ ...base, appointment: { ...base.appointment, startTime: input } });
      expect(result.success && result.data.appointment.startTime).toBe(expected);
    });

    it.each(['null', 'none', 'N/A', 'unknown', ''])('treats the string "%s" as absent', (value) => {
      const result = parse({ ...base, appointment: { ...base.appointment, appointmentType: value } });
      expect(result.success && result.data.appointment.appointmentType).toBeNull();
    });

    it('accepts snake_case keys', () => {
      const result = parse({
        intent: 'book_appointment',
        reply: 'Got it.',
        appointment: {
          appointment_type: 'Dentist',
          date: '2026-08-25',
          start_time: '15:00',
          duration_minutes: 30,
        },
        missing_fields: ['notes'],
        needs_clarification: true,
      });

      expect(result.success && result.data.appointment.appointmentType).toBe('Dentist');
      expect(result.success && result.data.needsClarification).toBe(true);
    });

    it('accepts a flattened response with no appointment object', () => {
      const result = parse({
        intent: 'book_appointment',
        reply: 'Got it.',
        appointmentType: 'Dentist',
        date: '2026-08-25',
        startTime: '15:00',
        durationMinutes: 30,
      });

      expect(result.success && result.data.appointment.date).toBe('2026-08-25');
    });

    it('reads a duration written as text', () => {
      const result = parse({
        ...base,
        appointment: { ...base.appointment, durationMinutes: '45 minutes' },
      });
      expect(result.success && result.data.appointment.durationMinutes).toBe(45);
    });
  });

  describe('facts the model gets wrong are rejected', () => {
    it.each([
      ['a relative date', 'next tuesday'],
      ['a non-existent date', '2026-02-30'],
      ['a US-format date', '08/25/2026'],
      ['a placeholder', 'YYYY-MM-DD'],
    ])('rejects %s', (_label, date) => {
      expect(parse({ ...base, appointment: { ...base.appointment, date } }).success).toBe(false);
    });

    it.each(['25:00', 'afternoon', 'sometime'])('rejects the time %s', (startTime) => {
      expect(parse({ ...base, appointment: { ...base.appointment, startTime } }).success).toBe(false);
    });

    it.each([5, 1000, -30])('rejects the out-of-range duration %s', (durationMinutes) => {
      expect(
        parse({ ...base, appointment: { ...base.appointment, durationMinutes } }).success,
      ).toBe(false);
    });

    it('rejects an intent outside the allowed set', () => {
      expect(parse({ ...base, intent: 'delete_all_appointments' }).success).toBe(false);
    });

    it('rejects a response with no reply text', () => {
      expect(parse({ ...base, reply: '' }).success).toBe(false);
    });

    it.each([null, undefined, 'a plain sentence', 42, []])('rejects the non-object %s', (raw) => {
      expect(parse(raw).success).toBe(false);
    });

    it('drops extra keys instead of passing them through', () => {
      const result = parse({
        ...base,
        userId: 'someone-else',
        appointment: { ...base.appointment, status: 'CONFIRMED' },
      });

      expect(result.success).toBe(true);
      expect(result.success && result.data).not.toHaveProperty('userId');
      expect(result.success && result.data.appointment).not.toHaveProperty('status');
    });
  });

  describe('soft fields degrade rather than fail', () => {
    it('falls back to an empty list when missingFields is the wrong type', () => {
      const result = parse({ ...base, missingFields: 'startTime' });
      expect(result.success && result.data.missingFields).toEqual([]);
    });

    it('falls back to needing clarification when the flag is unusable', () => {
      const result = parse({ ...base, needsClarification: 'maybe' });
      expect(result.success && result.data.needsClarification).toBe(true);
    });
  });
});
