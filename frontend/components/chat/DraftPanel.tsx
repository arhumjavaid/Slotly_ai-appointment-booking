'use client';

import Link from 'next/link';
import { cn, formatDuration, formatFullDate, formatTimeLabel } from '@/lib/format';
import { Button } from '@/components/ui';
import type { Appointment, BookingDraft } from '@/types/api';

/**
 * The booking draft, shown beside the conversation.
 *
 * This panel is the server's view of the booking, not the model's — it renders
 * the draft the backend has accumulated and validated. Making that state
 * visible is what turns "hope the AI understood" into something the user can
 * check before confirming.
 */

function Row({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: string | null;
  placeholder: string;
}) {
  const filled = Boolean(value);

  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-[13px] text-ink-3">{label}</span>
      <span
        className={cn(
          'truncate text-right text-[13px]',
          filled ? 'font-medium text-ink' : 'text-ink-3 italic',
        )}
      >
        {value ?? placeholder}
      </span>
    </div>
  );
}

interface DraftPanelProps {
  draft: BookingDraft | null;
  missingFields: string[];
  readyToConfirm: boolean;
  isConfirming: boolean;
  bookedAppointment: Appointment | null;
  onConfirm: () => void;
  onRestart: () => void;
}

export function DraftPanel({
  draft,
  missingFields,
  readyToConfirm,
  isConfirming,
  bookedAppointment,
  onConfirm,
  onRestart,
}: DraftPanelProps) {
  if (bookedAppointment) {
    return (
      <div className="rounded-xl border border-ok/25 bg-ok-soft p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ok">Booked</p>
        <p className="mt-2 text-sm font-medium text-ink">{bookedAppointment.appointmentType}</p>
        <p className="tnum mt-0.5 text-[13px] text-ink-2">
          {formatFullDate(bookedAppointment.date)} at {formatTimeLabel(bookedAppointment.startTime)}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Link href="/appointments">
            <Button variant="secondary" size="sm" className="w-full">
              View appointments
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={onRestart} className="w-full">
            Book another
          </Button>
        </div>
      </div>
    );
  }

  const summary = {
    type: draft?.appointmentType ?? null,
    date: draft?.date ? formatFullDate(draft.date) : null,
    time: draft?.startTime ? formatTimeLabel(draft.startTime) : null,
    duration: draft?.durationMinutes ? formatDuration(draft.durationMinutes) : null,
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Appointment summary
      </p>

      <div className="mt-1 divide-y divide-line">
        <Row label="Type" value={summary.type} placeholder="Not set yet" />
        <Row label="Date" value={summary.date} placeholder="Not set yet" />
        <Row label="Time" value={summary.time} placeholder="Not set yet" />
        <Row label="Duration" value={summary.duration} placeholder="30 min (default)" />
      </div>

      {/* Notes are optional, so the row only appears once there is one to check. */}
      {draft?.notes && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[13px] text-ink-3">Notes</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">{draft.notes}</p>
        </div>
      )}

      {readyToConfirm ? (
        <div className="mt-4">
          <Button onClick={onConfirm} loading={isConfirming} className="w-full">
            Confirm appointment
          </Button>
          <p className="mt-2 text-[12px] leading-snug text-ink-3">
            Nothing is booked until you confirm.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-[12px] leading-snug text-ink-3">
          {missingFields.length > 0
            ? 'Keep chatting — the assistant still needs a few details.'
            : 'Tell the assistant what you would like to book.'}
        </p>
      )}
    </div>
  );
}
