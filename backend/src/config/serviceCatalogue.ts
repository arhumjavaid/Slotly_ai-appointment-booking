/**
 * The default catalogue of bookable services and their opening hours.
 *
 * This is seed data, not runtime configuration — the application always reads
 * services from the database. It lives in one module so the SQL seed, the
 * Prisma seed and the test fixtures cannot drift apart.
 *
 * Hours are expressed as OPEN WINDOWS. A service working 09:00-12:00 and then
 * 14:00-18:00 has two windows for those weekdays; the two-hour break is the
 * gap between them. A weekday with no window is closed.
 */

/** 0 = Sunday .. 6 = Saturday, matching JavaScript's `Date.getDay()`. */
export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;

export interface ServiceWindowDefinition {
  weekdays: number[];
  startTime: string;
  endTime: string;
}

export interface ServiceDefinition {
  name: string;
  slug: string;
  defaultDurationMinutes: number;
  windows: ServiceWindowDefinition[];
}

const WEEKDAYS = [MON, TUE, WED, THU, FRI];

export const SERVICE_CATALOGUE: ServiceDefinition[] = [
  {
    name: 'Doctor',
    slug: 'doctor',
    defaultDurationMinutes: 30,
    // The split shift: a two-hour lunch break that bookings cannot straddle.
    windows: [
      { weekdays: WEEKDAYS, startTime: '09:00', endTime: '12:00' },
      { weekdays: WEEKDAYS, startTime: '14:00', endTime: '18:00' },
    ],
  },
  {
    name: 'Dentist',
    slug: 'dentist',
    defaultDurationMinutes: 45,
    windows: [
      { weekdays: [MON, TUE, WED, THU], startTime: '09:00', endTime: '17:00' },
      { weekdays: [FRI], startTime: '09:00', endTime: '13:00' },
    ],
  },
  {
    name: 'Haircut',
    slug: 'haircut',
    defaultDurationMinutes: 30,
    windows: [
      { weekdays: [TUE, WED, THU, FRI], startTime: '10:00', endTime: '19:00' },
      { weekdays: [SAT], startTime: '09:00', endTime: '16:00' },
    ],
  },
  {
    name: 'Consultation',
    slug: 'consultation',
    defaultDurationMinutes: 60,
    windows: [{ weekdays: WEEKDAYS, startTime: '13:00', endTime: '17:00' }],
  },
  {
    name: 'Physiotherapy',
    slug: 'physiotherapy',
    defaultDurationMinutes: 45,
    windows: [
      { weekdays: [MON, WED, FRI], startTime: '08:00', endTime: '12:00' },
      { weekdays: [MON, WED, FRI], startTime: '15:00', endTime: '19:00' },
    ],
  },
  {
    name: 'Optician',
    slug: 'optician',
    defaultDurationMinutes: 30,
    windows: [{ weekdays: [...WEEKDAYS, SAT], startTime: '10:00', endTime: '18:00' }],
  },
  {
    name: 'Dermatologist',
    slug: 'dermatologist',
    defaultDurationMinutes: 30,
    windows: [{ weekdays: [TUE, THU], startTime: '09:00', endTime: '13:00' }],
  },
];

/** Flattens a definition into one row per weekday, as the table stores them. */
export function toAvailabilityRows(
  service: ServiceDefinition,
): Array<{ weekday: number; startTime: string; endTime: string }> {
  return service.windows.flatMap((window) =>
    window.weekdays.map((weekday) => ({
      weekday,
      startTime: window.startTime,
      endTime: window.endTime,
    })),
  );
}
