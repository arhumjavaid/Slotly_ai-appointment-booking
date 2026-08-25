import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import type { AppointmentStatus } from '@/types/api';

/** "2026-08-25" -> "Tue, Aug 25" (or "Today" / "Tomorrow"). */
export function formatDateLabel(date: string): string {
  const parsed = parseISO(`${date}T00:00:00`);
  if (isToday(parsed)) return 'Today';
  if (isTomorrow(parsed)) return 'Tomorrow';
  return format(parsed, 'EEE, MMM d');
}

/** "2026-08-25" -> "August 25, 2026". */
export function formatFullDate(date: string): string {
  return format(parseISO(`${date}T00:00:00`), 'MMMM d, yyyy');
}

/** "15:00" -> "3:00 PM". */
export function formatTimeLabel(time: string): string {
  const [hourPart, minutePart] = time.split(':');
  const hour = Number(hourPart);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minutePart} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourLabel = `${hours} hr${hours > 1 ? 's' : ''}`;
  return rest === 0 ? hourLabel : `${hourLabel} ${rest} min`;
}

export const STATUS_STYLES: Record<AppointmentStatus, { label: string; className: string }> = {
  CONFIRMED: { label: 'Confirmed', className: 'bg-ok-soft text-ok' },
  PENDING: { label: 'Pending', className: 'bg-warn-soft text-warn' },
  CANCELLED: { label: 'Cancelled', className: 'bg-danger-soft text-danger' },
  COMPLETED: { label: 'Completed', className: 'bg-paper text-ink-3' },
};

/** Field names as the backend reports them, as a person would say them. */
export const FIELD_LABELS: Record<string, string> = {
  appointmentType: 'what the appointment is for',
  date: 'a date',
  startTime: 'a start time',
  durationMinutes: 'a duration',
};

export function describeMissingFields(fields: string[]): string {
  const labels = fields.map((field) => FIELD_LABELS[field] ?? field);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** Minimal class joiner — avoids pulling in a dependency for six characters. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
