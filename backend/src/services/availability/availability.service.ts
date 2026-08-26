import { ApiError, ErrorCode } from '../../utils/apiError';
import { dbTimeToTime, utcToZonedParts, weekdayIndexOf, zonedTimeToUtc } from '../../utils/time';
import {
  serviceTypeRepository,
  type ServiceTypeWithRules,
} from '../../repositories/serviceType.repository';
import { WEEKDAY_NAMES } from '../../config/serviceCatalogue';

/**
 * Opening hours.
 *
 * Two things live here and nowhere else: turning stored weekly rules into
 * concrete windows on a given date, and deciding whether a booking falls
 * inside one. The AI is told about hours so that it behaves well, but it is
 * never the thing that enforces them — `assertWithinAvailability` runs in the
 * appointment service, after the model has spoken and on the manual path too.
 *
 * Matching is permissive by design: an appointment type that matches no
 * service is unconstrained, exactly as every booking was before this feature.
 * That keeps the catalogue a source of rules rather than a whitelist, which is
 * a product decision this prototype has not taken.
 */

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface AvailabilityWindow {
  startTime: string;
  endTime: string;
}

export interface DayAvailability {
  weekday: number;
  /** Empty means closed that day. */
  windows: AvailabilityWindow[];
}

export interface ServiceView {
  id: string;
  name: string;
  slug: string;
  defaultDurationMinutes: number;
  /** Always seven entries, Sunday first, so clients can render a full week. */
  days: DayAvailability[];
}

/** Reduces free text to comparable words: "Dentist's Appt." -> "dentists appt". */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The windows a service is open in on one weekday, earliest first. */
function windowsForWeekday(service: ServiceTypeWithRules, weekday: number): AvailabilityWindow[] {
  return service.availabilityRules
    .filter((rule) => rule.weekday === weekday)
    .map((rule) => ({ startTime: dbTimeToTime(rule.startsAt), endTime: dbTimeToTime(rule.endsAt) }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function toServiceView(service: ServiceTypeWithRules): ServiceView {
  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    defaultDurationMinutes: service.defaultDurationMinutes,
    days: WEEKDAY_NAMES.map((_, weekday) => ({
      weekday,
      windows: windowsForWeekday(service, weekday),
    })),
  };
}

/**
 * The error raised when a service has no windows at all on a weekday.
 *
 * Built here rather than inline because it is raised from two places: the full
 * booking check, and the day-only check the assistant runs before a time has
 * even been chosen. It blames the *date*, since no time on that day can work.
 */
function closedDayError(service: ServiceTypeWithRules, weekday: number): ApiError {
  const dayName = WEEKDAY_NAMES[weekday];
  return new ApiError(
    409,
    ErrorCode.OUTSIDE_AVAILABILITY,
    `${service.name} is closed on ${dayName}s. Open hours: ${formatWeeklyHours(toServiceView(service))}.`,
    [{ field: 'date', message: `${service.name} is closed on ${dayName}s` }],
  );
}

/** "09:00-12:00 and 14:00-18:00", or "closed". */
function formatWindows(windows: AvailabilityWindow[]): string {
  if (windows.length === 0) return 'closed';
  const parts = windows.map((w) => `${w.startTime}-${w.endTime}`);
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/**
 * Weekly hours as one entry per run of days that share the same windows:
 * ["Mon-Fri 09:00-12:00 and 14:00-18:00", "Sat 09:00-16:00"].
 *
 * Returned as an array so a caller can put each run on its own line; closed
 * days are omitted rather than listed, because a reader infers them and the
 * text also goes into a prompt where brevity is worth real money.
 */
export function weeklyHourGroups(service: ServiceView): string[] {
  // Monday first: a week that starts on Sunday would split Mon-Fri into two runs.
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((weekday) => service.days[weekday]!);
  const texts = ordered.map((day) => formatWindows(day.windows));

  const groups: Array<{ from: number; to: number; text: string }> = [];
  for (let i = 0; i < ordered.length; ) {
    if (texts[i] === 'closed') {
      i += 1;
      continue;
    }
    // Extend the run while the next day keeps the same hours.
    let end = i;
    while (end + 1 < ordered.length && texts[end + 1] === texts[i]) end += 1;
    groups.push({ from: ordered[i]!.weekday, to: ordered[end]!.weekday, text: texts[i]! });
    i = end + 1;
  }

  return groups.map((group) => {
    const label =
      group.from === group.to
        ? SHORT_WEEKDAYS[group.from]
        : `${SHORT_WEEKDAYS[group.from]}-${SHORT_WEEKDAYS[group.to]}`;
    return `${label} ${group.text}`;
  });
}

/** The same runs as one line: "Mon-Fri 09:00-17:00; Sat 09:00-13:00". */
export function formatWeeklyHours(service: ServiceView): string {
  const groups = weeklyHourGroups(service);
  return groups.length === 0 ? 'no opening hours set' : groups.join('; ');
}

export const availabilityService = {
  async listServices(): Promise<ServiceView[]> {
    const services = await serviceTypeRepository.listActive();
    return services.map(toServiceView);
  },

  /**
   * Finds the service a free-text appointment type refers to.
   *
   * Deliberately small: an exact name/slug match, then a whole-word mention
   * inside a longer phrase ("dentist appointment"), then an abbreviation that
   * prefixes the slug ("physio"). The longest match wins so that a phrase
   * mentioning two services resolves to the more specific one. Anything less
   * clear-cut returns null and stays unconstrained rather than guessing at a
   * rule to enforce.
   */
  async matchService(text: string): Promise<ServiceTypeWithRules | null> {
    const needle = normalise(text);
    if (!needle) return null;

    const services = await serviceTypeRepository.listActive();
    let best: { service: ServiceTypeWithRules; score: number } | null = null;

    for (const service of services) {
      const name = normalise(service.name);
      const slug = normalise(service.slug);

      let score = 0;
      if (needle === name || needle === slug) score = 100;
      else if (new RegExp(`\\b${name}\\b`).test(needle)) score = name.length;
      else if (needle.length >= 4 && slug.startsWith(needle)) score = needle.length;

      if (score > 0 && (!best || score > best.score)) best = { service, score };
    }

    return best?.service ?? null;
  },

  /** The windows a service is open in on a specific calendar date. */
  async windowsFor(serviceSlug: string, date: string): Promise<AvailabilityWindow[]> {
    const services = await serviceTypeRepository.listActive();
    const service = services.find((candidate) => candidate.slug === serviceSlug);
    if (!service) return [];
    return windowsForWeekday(service, weekdayIndexOf(date));
  },

  /**
   * Rejects a booking that falls outside its service's opening hours.
   *
   * No-ops when the appointment type matches no service. The booking must fit
   * entirely inside a single window: that is what makes a gap between two
   * windows an actual break rather than decoration.
   */
  async assertWithinAvailability(
    appointmentType: string,
    startsAt: Date,
    endsAt: Date,
    timezone: string,
  ): Promise<void> {
    const service = await this.matchService(appointmentType);
    if (!service) return;

    // The weekday comes from the local date of the instant, not from whatever
    // date string a caller happened to send, so the two can never disagree.
    const localDate = utcToZonedParts(startsAt, timezone).date;
    const weekday = weekdayIndexOf(localDate);
    const windows = windowsForWeekday(service, weekday);
    const dayName = WEEKDAY_NAMES[weekday];

    if (windows.length === 0) throw closedDayError(service, weekday);

    const fits = windows.some((window) => {
      const windowStart = zonedTimeToUtc(localDate, window.startTime, timezone);
      const windowEnd = zonedTimeToUtc(localDate, window.endTime, timezone);
      return startsAt.getTime() >= windowStart.getTime() && endsAt.getTime() <= windowEnd.getTime();
    });

    if (!fits) {
      throw new ApiError(
        409,
        ErrorCode.OUTSIDE_AVAILABILITY,
        `${service.name} is open ${formatWindows(windows)} on ${dayName}. Please choose a time inside those hours.`,
        [
          {
            field: 'startTime',
            message: `Outside ${service.name}'s hours on ${dayName} (${formatWindows(windows)})`,
          },
        ],
      );
    }
  },

  /**
   * Rejects a date the service is closed on, without needing a time.
   *
   * The full check cannot run until a time is known, but "closed all day" is
   * decidable the moment the service and the date are — and the assistant
   * needs to know that before it asks "what time?", or it invites the user to
   * pick an hour on a day where no hour works.
   */
  async assertDayIsOpen(appointmentType: string, date: string): Promise<void> {
    const service = await this.matchService(appointmentType);
    if (!service) return;

    const weekday = weekdayIndexOf(date);
    if (windowsForWeekday(service, weekday).length === 0) {
      throw closedDayError(service, weekday);
    }
  },

  /**
   * The answer to "what is available?", built here rather than by the model.
   *
   * Returns both a structured list for the UI to lay out and a plain-text
   * rendering for the stored transcript. The model supplies only a one-line
   * lead-in, so the times a user reads are always the times in the database —
   * the same reason the booking rules are not left to it either.
   *
   * `appointmentType` narrows the answer to one service when the user asked
   * about a specific one; otherwise the whole catalogue is listed.
   */
  async summariseAvailability(appointmentType?: string | null): Promise<{
    services: Array<{ name: string; defaultDurationMinutes: number; hours: string[] }>;
    text: string;
  }> {
    const all = await this.listServices();

    const matched = appointmentType ? await this.matchService(appointmentType) : null;
    const chosen = matched ? all.filter((service) => service.slug === matched.slug) : all;

    const services = chosen.map((service) => ({
      name: service.name,
      defaultDurationMinutes: service.defaultDurationMinutes,
      hours: weeklyHourGroups(service),
    }));

    const text = services
      .map((service) =>
        [
          `${service.name} (${service.defaultDurationMinutes} min)`,
          ...(service.hours.length > 0 ? service.hours : ['No opening hours set']),
        ].join('\n  '),
      )
      .join('\n\n');

    return { services, text };
  },

  /**
   * The catalogue as a compact block for the model's prompt.
   *
   * Injecting the hours as fact is the same technique the date calendar uses:
   * the model reads rather than reasons, and anything it still gets wrong is
   * caught by `assertWithinAvailability` afterwards.
   */
  async describeCatalogue(): Promise<string> {
    const services = await this.listServices();
    return services
      .map(
        (service) =>
          `  ${service.name} (${service.defaultDurationMinutes} min) — ${formatWeeklyHours(service)}`,
      )
      .join('\n');
  },
};
