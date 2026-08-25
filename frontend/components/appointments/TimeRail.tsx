'use client';

import { Fragment } from 'react';
import { cn, formatDateLabel, formatDuration, formatTimeLabel, STATUS_STYLES } from '@/lib/format';
import { Badge } from '@/components/ui';
import type { Appointment } from '@/types/api';

/**
 * Appointments hung off a vertical time rail, grouped by day.
 *
 * The rail is the one place this interface is expressive, and it earns it: the
 * bar beside each row is proportional to the appointment's length, so a glance
 * down the column shows how much of a day is committed — something a flat list
 * of rows cannot convey.
 */

/** Bar length as a fraction of an 8-hour reference day, floored so 15 min is visible. */
function durationBarHeight(minutes: number): number {
  const MAX_MINUTES = 240;
  const MIN_PX = 14;
  const MAX_PX = 56;
  const ratio = Math.min(minutes, MAX_MINUTES) / MAX_MINUTES;
  return Math.round(MIN_PX + ratio * (MAX_PX - MIN_PX));
}

function groupByDate(appointments: Appointment[]): Array<[string, Appointment[]]> {
  const groups = new Map<string, Appointment[]>();
  for (const appointment of appointments) {
    const existing = groups.get(appointment.date);
    if (existing) existing.push(appointment);
    else groups.set(appointment.date, [appointment]);
  }
  return [...groups.entries()];
}

interface TimeRailProps {
  appointments: Appointment[];
  onCancel?: (appointment: Appointment) => void;
  cancellingId?: string | null;
}

export function TimeRail({ appointments, onCancel, cancellingId }: TimeRailProps) {
  const groups = groupByDate(appointments);

  return (
    <div>
      {groups.map(([date, items], groupIndex) => (
        <Fragment key={date}>
          <div className={cn('px-5 pb-2', groupIndex === 0 ? 'pt-4' : 'pt-6')}>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              {formatDateLabel(date)}
            </h3>
          </div>

          <ul className="px-5">
            {items.map((appointment) => {
              const cancelled = appointment.status === 'CANCELLED';
              const status = STATUS_STYLES[appointment.status];

              return (
                <li
                  key={appointment.id}
                  className="group relative -mx-2 flex gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-paper"
                >
                  {/* The rail: time label, then a bar sized by duration. */}
                  <div className="flex w-[74px] shrink-0 flex-col items-end pt-0.5">
                    <span className={cn('tnum text-[13px]', cancelled ? 'text-ink-3' : 'text-ink')}>
                      {formatTimeLabel(appointment.startTime)}
                    </span>
                    <span className="tnum whitespace-nowrap text-[11px] text-ink-3">
                      {formatDuration(appointment.durationMinutes)}
                    </span>
                  </div>

                  <div
                    aria-hidden="true"
                    className={cn(
                      'mt-1 w-[3px] shrink-0 rounded-full',
                      cancelled ? 'bg-line-strong' : 'bg-navy',
                    )}
                    style={{ height: `${durationBarHeight(appointment.durationMinutes)}px` }}
                  />

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={cn(
                          'truncate text-sm font-medium',
                          cancelled ? 'text-ink-3 line-through' : 'text-ink',
                        )}
                      >
                        {appointment.appointmentType}
                      </p>
                      <Badge className={status.className}>{status.label}</Badge>
                      {appointment.source === 'AI' && (
                        <Badge className="bg-accent-soft text-accent">Booked by chat</Badge>
                      )}
                    </div>
                    {appointment.notes && (
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{appointment.notes}</p>
                    )}
                  </div>

                  {onCancel && !cancelled && appointment.status !== 'COMPLETED' && (
                    <button
                      type="button"
                      onClick={() => onCancel(appointment)}
                      disabled={cancellingId === appointment.id}
                      className={cn(
                        'shrink-0 self-start rounded-md px-2 py-1 text-[12px] font-medium text-ink-3',
                        'transition-colors hover:bg-danger-soft hover:text-danger',
                        'focus-visible:opacity-100 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100',
                      )}
                    >
                      {cancellingId === appointment.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Fragment>
      ))}
      <div className="h-4" />
    </div>
  );
}
