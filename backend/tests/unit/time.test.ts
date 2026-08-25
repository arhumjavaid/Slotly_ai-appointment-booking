import { describe, expect, it } from 'vitest';
import {
  describeNow,
  isValidDateString,
  isValidTimeString,
  isValidTimezone,
  utcToZonedParts,
  zonedTimeToUtc,
} from '../../src/utils/time';

describe('timezone conversion', () => {
  it('treats a UTC wall-clock time as the same instant', () => {
    expect(zonedTimeToUtc('2026-08-25', '15:00', 'UTC').toISOString()).toBe(
      '2026-08-25T15:00:00.000Z',
    );
  });

  it('applies a fixed offset zone', () => {
    // Asia/Karachi is UTC+5 year-round.
    expect(zonedTimeToUtc('2026-08-25', '15:00', 'Asia/Karachi').toISOString()).toBe(
      '2026-08-25T10:00:00.000Z',
    );
  });

  it('applies the summer offset for a DST zone', () => {
    // New York is UTC-4 in August.
    expect(zonedTimeToUtc('2026-08-25', '15:00', 'America/New_York').toISOString()).toBe(
      '2026-08-25T19:00:00.000Z',
    );
  });

  it('applies the winter offset for the same zone', () => {
    // ...and UTC-5 in January.
    expect(zonedTimeToUtc('2026-01-15', '15:00', 'America/New_York').toISOString()).toBe(
      '2026-01-15T20:00:00.000Z',
    );
  });

  it('resolves a time just after a spring-forward transition', () => {
    // US DST begins 2026-03-08 at 02:00 local; 03:00 is the first valid local
    // time after the skipped hour, and is already on the summer offset (UTC-4).
    // A naive single-pass conversion would use the winter offset here and land
    // an hour late.
    expect(zonedTimeToUtc('2026-03-08', '03:00', 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    );
  });

  it('round-trips a local time through UTC and back', () => {
    for (const zone of ['UTC', 'Asia/Karachi', 'America/New_York', 'Australia/Sydney']) {
      const instant = zonedTimeToUtc('2026-08-25', '15:00', zone);
      expect(utcToZonedParts(instant, zone)).toEqual({ date: '2026-08-25', time: '15:00' });
    }
  });

  it('renders midnight as 00:00, not 24:00', () => {
    const instant = zonedTimeToUtc('2026-08-25', '00:00', 'Asia/Karachi');
    expect(utcToZonedParts(instant, 'Asia/Karachi').time).toBe('00:00');
  });
});

/**
 * Date context injected into the prompt.
 *
 * The model proved unreliable at date arithmetic, so these values are computed
 * here and it is asked to copy them. That only helps if they are correct and
 * legibly formatted — a version of this table silently collapsed onto one line
 * in the template and the model started reading the wrong row, so the layout is
 * asserted too, not just the values.
 */
describe('prompt date context', () => {
  // A Tuesday, deliberately mid-week so weekday maths can go wrong in either
  // direction.
  const REFERENCE = new Date('2026-08-25T09:00:00.000Z');

  it('reports today and tomorrow correctly', () => {
    const now = describeNow('UTC', REFERENCE);
    expect(now.currentDate).toBe('2026-08-25');
    expect(now.weekday).toBe('Tuesday');
    expect(now.tomorrow).toBe('2026-08-26');
  });

  it('pairs every calendar date with its real weekday', () => {
    const now = describeNow('UTC', REFERENCE);

    for (const day of now.calendar) {
      const actual = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        weekday: 'long',
      }).format(new Date(`${day.date}T12:00:00Z`));
      expect(day.weekday).toBe(actual);
    }
  });

  it('advances the calendar one day at a time with no gaps or repeats', () => {
    const dates = describeNow('UTC', REFERENCE).calendar.map((day) => day.date);

    expect(new Set(dates).size).toBe(dates.length);
    for (let i = 1; i < dates.length; i += 1) {
      const previous = new Date(`${dates[i - 1]}T00:00:00Z`).getTime();
      const current = new Date(`${dates[i]}T00:00:00Z`).getTime();
      expect(current - previous).toBe(86_400_000);
    }
  });

  it('labels only today and tomorrow', () => {
    const labelled = describeNow('UTC', REFERENCE).calendar.filter((day) => day.label);
    expect(labelled.map((day) => day.label)).toEqual(['today', 'tomorrow']);
  });

  it('maps each weekday name to its soonest upcoming date', () => {
    const now = describeNow('UTC', REFERENCE);
    const lookup = Object.fromEntries(now.weekdayLookup.map((d) => [d.weekday, d.date]));

    // From Tuesday the 25th: Friday is the 28th, not the 29th — the exact
    // off-by-one the model produced when left to count for itself.
    expect(lookup.Wednesday).toBe('2026-08-26');
    expect(lookup.Friday).toBe('2026-08-28');
    expect(lookup.Saturday).toBe('2026-08-29');
    expect(lookup.Monday).toBe('2026-08-31');
    // Today's own weekday resolves to next week, never to today.
    expect(lookup.Tuesday).toBe('2026-09-01');
  });

  it('covers all seven weekdays exactly once', () => {
    const { weekdayLookup } = describeNow('UTC', REFERENCE);
    expect(weekdayLookup).toHaveLength(7);
    expect(new Set(weekdayLookup.map((d) => d.weekday)).size).toBe(7);
  });

  it('renders each date on its own line, so the model cannot misread a row', () => {
    const now = describeNow('UTC', REFERENCE);

    const calendarLines = now.calendarText.split('\n');
    expect(calendarLines).toHaveLength(now.calendar.length);
    calendarLines.forEach((line, index) => {
      expect(line).toContain(now.calendar[index]!.date);
      expect(line).toContain(now.calendar[index]!.weekday);
    });

    const weekdayLines = now.weekdayText.split('\n');
    expect(weekdayLines).toHaveLength(7);
    expect(weekdayLines[0]).toMatch(/^\s+Wednesday\s+-> 2026-08-26$/);
  });

  it('resolves against the given timezone, not the server clock', () => {
    // 19:00Z on the 25th is already the 26th in Auckland.
    const instant = new Date('2026-08-25T19:00:00.000Z');
    expect(describeNow('UTC', instant).currentDate).toBe('2026-08-25');
    expect(describeNow('Pacific/Auckland', instant).currentDate).toBe('2026-08-26');
  });
});

describe('input validators', () => {
  it.each(['2026-08-25', '2024-02-29'])('accepts the valid date %s', (value) => {
    expect(isValidDateString(value)).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', '25-08-2026', '2026-8-5', 'tomorrow', ''])(
    'rejects the invalid date %s',
    (value) => {
      expect(isValidDateString(value)).toBe(false);
    },
  );

  it.each(['00:00', '09:30', '23:59'])('accepts the valid time %s', (value) => {
    expect(isValidTimeString(value)).toBe(true);
  });

  it.each(['24:00', '9:30', '15:60', '3pm', ''])('rejects the invalid time %s', (value) => {
    expect(isValidTimeString(value)).toBe(false);
  });

  it('accepts real IANA zones and rejects invented ones', () => {
    expect(isValidTimezone('Europe/London')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });
});
