/**
 * Timezone helpers.
 *
 * Appointments are captured as a local calendar date + wall-clock time in a
 * specific IANA zone (that is how both a human and the AI naturally express
 * them) and persisted as UTC instants. Doing the conversion here — rather than
 * in each caller — means the manual form and the AI flow cannot drift apart.
 *
 * Implemented on top of `Intl` so no date library is required.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function isValidTimeString(value: string): boolean {
  return TIME_RE.test(value);
}

/** Offset of `timeZone` from UTC, in milliseconds, at the given instant. */
function timezoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  // `hour` can come back as "24" for midnight in some ICU versions.
  const hour = Number(parts.hour) % 24;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );

  return asUtc - instant.getTime();
}

/**
 * Converts a local date + time in `timeZone` to the corresponding UTC instant.
 *
 * The offset depends on the instant we are trying to find, so we guess once
 * (treating the wall-clock as UTC), then correct. A second pass settles the
 * DST-boundary cases where the first guess lands on the other side of a shift.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const naive = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(naive.getTime())) {
    throw new RangeError(`Invalid date/time: ${date} ${time}`);
  }

  let instant = new Date(naive.getTime() - timezoneOffsetMs(naive, timeZone));
  instant = new Date(naive.getTime() - timezoneOffsetMs(instant, timeZone));
  return instant;
}

/** Formats a UTC instant back into `{ date, time }` as seen in `timeZone`. */
export function utcToZonedParts(instant: Date, timeZone: string): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const hour = String(Number(parts.hour) % 24).padStart(2, '0');
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

/** Today's calendar date in `timeZone`, as `YYYY-MM-DD`. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  return utcToZonedParts(now, timeZone).date;
}

/** Calendar days ahead to resolve for the model. Covers "next <weekday>". */
const CALENDAR_HORIZON_DAYS = 14;

export interface DateHint {
  date: string;
  weekday: string;
  label: string;
}

/**
 * Human-friendly context handed to the AI so it can resolve "tomorrow".
 *
 * Alongside today's date, this precomputes the actual calendar dates for the
 * next two weeks. Language models are unreliable at date arithmetic — in
 * testing, "tomorrow" was resolved one day late often enough to matter — so
 * the prompt provides a lookup table instead and asks the model to copy from
 * it. Correctness moves from the model to code that can be tested.
 */
export function describeNow(timeZone: string, now: Date = new Date()) {
  const { date, time } = utcToZonedParts(now, timeZone);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(now);

  const calendar: DateHint[] = [];
  for (let offset = 0; offset <= CALENDAR_HORIZON_DAYS; offset += 1) {
    const instant = new Date(now.getTime() + offset * 86_400_000);
    const parts = utcToZonedParts(instant, timeZone);
    const dayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(instant);
    const label = offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : '';
    calendar.push({ date: parts.date, weekday: dayName, label });
  }

  // Soonest upcoming occurrence of each weekday name, as a direct key -> value
  // list. Models scan a two-column table unreliably but follow an explicit
  // mapping well, and a named weekday is the most common way users express a
  // date after "today"/"tomorrow".
  const seen = new Set<string>();
  const weekdayLookup: DateHint[] = [];
  for (const day of calendar.slice(1)) {
    if (seen.has(day.weekday)) continue;
    seen.add(day.weekday);
    weekdayLookup.push(day);
  }

  const weekdayText = weekdayLookup
    .map((day) => `    ${day.weekday.padEnd(9)} -> ${day.date}`)
    .join('\n');

  // Pre-formatted as a single string rather than looped in the template:
  // Nunjucks' trimBlocks strips the newline after each block tag, which
  // silently collapsed this table onto one line and made the model read the
  // wrong row. Formatting here keeps the layout under test.
  const calendarText = calendar
    .map((day) => {
      const row = `    ${day.date}  ${day.weekday.padEnd(9)}`;
      return day.label ? `${row}  <- ${day.label}` : row;
    })
    .join('\n');

  return {
    currentDate: date,
    currentTime: time,
    weekday,
    timezone: timeZone,
    tomorrow: calendar[1]?.date ?? date,
    calendar,
    calendarText,
    weekdayLookup,
    weekdayText,
  };
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

/**
 * Weekday of a calendar date, as 0 = Sunday .. 6 = Saturday.
 *
 * Anchored at noon UTC rather than midnight: a date is a pure calendar concept
 * here, and midnight sits close enough to a DST boundary that some zones would
 * report the previous day.
 */
export function weekdayIndexOf(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

/**
 * Converts "HH:mm" to the value Prisma expects for a `TIME` column.
 *
 * Prisma models `TIME` as a `Date` pinned to 1970-01-01 with no zone applied,
 * so the epoch date is a carrier for the wall-clock time and nothing more.
 * Both directions live here so that assumption is stated in one place.
 */
export function timeToDbTime(time: string): Date {
  return new Date(`1970-01-01T${time}:00.000Z`);
}

/** Inverse of `timeToDbTime`: reads a `TIME` column back as "HH:mm". */
export function dbTimeToTime(value: Date): string {
  return value.toISOString().slice(11, 16);
}
