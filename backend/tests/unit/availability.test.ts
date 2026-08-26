import { describe, expect, it } from 'vitest';
import {
  formatWeeklyHours,
  type ServiceView,
} from '../../src/services/availability/availability.service';
import { dbTimeToTime, timeToDbTime, weekdayIndexOf } from '../../src/utils/time';

/** Builds a seven-day view from a sparse `weekday -> windows` map. */
function serviceView(
  hours: Record<number, Array<[string, string]>>,
  overrides: Partial<ServiceView> = {},
): ServiceView {
  return {
    id: 'service-id',
    name: 'Doctor',
    slug: 'doctor',
    defaultDurationMinutes: 30,
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      windows: (hours[weekday] ?? []).map(([startTime, endTime]) => ({ startTime, endTime })),
    })),
    ...overrides,
  };
}

describe('weekdayIndexOf', () => {
  it('maps a date to its weekday, Sunday first', () => {
    // 2026-08-24 is a Monday.
    expect(weekdayIndexOf('2026-08-24')).toBe(1);
    expect(weekdayIndexOf('2026-08-29')).toBe(6);
    expect(weekdayIndexOf('2026-08-30')).toBe(0);
  });

  it('is stable across a DST boundary', () => {
    // Anchoring at noon rather than midnight is what keeps these correct.
    expect(weekdayIndexOf('2026-03-29')).toBe(0);
    expect(weekdayIndexOf('2026-10-25')).toBe(0);
  });
});

describe('TIME column conversion', () => {
  it('round-trips a wall-clock time', () => {
    expect(dbTimeToTime(timeToDbTime('09:00'))).toBe('09:00');
    expect(dbTimeToTime(timeToDbTime('23:45'))).toBe('23:45');
  });

  it('carries the time on the epoch date, with no zone applied', () => {
    expect(timeToDbTime('14:30').toISOString()).toBe('1970-01-01T14:30:00.000Z');
  });
});

describe('formatWeeklyHours', () => {
  it('collapses consecutive days that share the same hours', () => {
    const view = serviceView({
      1: [['09:00', '17:00']],
      2: [['09:00', '17:00']],
      3: [['09:00', '17:00']],
      4: [['09:00', '17:00']],
      5: [['09:00', '17:00']],
    });

    expect(formatWeeklyHours(view)).toBe('Mon-Fri 09:00-17:00');
  });

  it('joins the two halves of a split shift', () => {
    const view = serviceView({
      1: [
        ['09:00', '12:00'],
        ['14:00', '18:00'],
      ],
    });

    expect(formatWeeklyHours(view)).toBe('Mon 09:00-12:00 and 14:00-18:00');
  });

  it('starts the week on Monday so weekdays are one run', () => {
    // A Sunday-first ordering would report "Sun ...; Mon-Fri ...", splitting
    // the working week across two groups.
    const view = serviceView({
      0: [['10:00', '14:00']],
      1: [['09:00', '17:00']],
      2: [['09:00', '17:00']],
      3: [['09:00', '17:00']],
      4: [['09:00', '17:00']],
      5: [['09:00', '17:00']],
    });

    expect(formatWeeklyHours(view)).toBe('Mon-Fri 09:00-17:00; Sun 10:00-14:00');
  });

  it('breaks a run where the hours change', () => {
    const view = serviceView({
      1: [['09:00', '17:00']],
      2: [['09:00', '17:00']],
      3: [['09:00', '17:00']],
      4: [['09:00', '17:00']],
      5: [['09:00', '13:00']],
    });

    expect(formatWeeklyHours(view)).toBe('Mon-Thu 09:00-17:00; Fri 09:00-13:00');
  });

  it('omits closed days rather than listing them', () => {
    const view = serviceView({
      2: [['09:00', '13:00']],
      4: [['09:00', '13:00']],
    });

    expect(formatWeeklyHours(view)).toBe('Tue 09:00-13:00; Thu 09:00-13:00');
  });

  it('reports a service with no rules at all', () => {
    expect(formatWeeklyHours(serviceView({}))).toBe('no opening hours set');
  });
});
