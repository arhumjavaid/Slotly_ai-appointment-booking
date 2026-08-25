'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { TimeRail } from '@/components/appointments/TimeRail';
import { useAppointments, useCancelAppointment } from '@/hooks/useAppointments';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/format';
import type { Appointment } from '@/types/api';

const FILTERS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export default function AppointmentsPage() {
  const [scope, setScope] = useState<FilterKey>('upcoming');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useAppointments({ scope, limit: 100 });
  const cancelAppointment = useCancelAppointment();

  const appointments = data?.appointments ?? [];

  async function handleCancel(appointment: Appointment) {
    setCancellingId(appointment.id);
    try {
      await cancelAppointment.mutateAsync(appointment.id);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] leading-tight text-ink">Appointments</h1>
          <p className="mt-1 text-sm text-ink-2">
            {data ? `${data.pagination.total} total` : 'Everything you have booked.'}
          </p>
        </div>
        <Link href="/book">
          <Button size="sm">Book an appointment</Button>
        </Link>
      </div>

      <div className="flex gap-1 border-b border-line">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setScope(filter.key)}
            aria-pressed={scope === filter.key}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              scope === filter.key
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-3 hover:text-ink',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {cancelAppointment.isError && (
        <Alert tone="error">{errorMessage(cancelAppointment.error, "Couldn't cancel that.")}</Alert>
      )}

      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="text-ink-3" />
            <span className="sr-only">Loading appointments</span>
          </div>
        ) : isError ? (
          <EmptyState
            title="Couldn't load your appointments"
            description="The server didn't respond. Refresh the page to try again."
          />
        ) : appointments.length === 0 ? (
          <EmptyState
            title={scope === 'past' ? 'Nothing in the past' : 'No appointments yet'}
            description={
              scope === 'past'
                ? 'Appointments move here once their time has passed.'
                : 'Book by chatting with the assistant, or fill in the form yourself.'
            }
            action={
              scope !== 'past' ? (
                <div className="flex gap-2">
                  <Link href="/assistant">
                    <Button size="sm">Start AI booking</Button>
                  </Link>
                  <Link href="/book">
                    <Button variant="secondary" size="sm">
                      Book manually
                    </Button>
                  </Link>
                </div>
              ) : undefined
            }
          />
        ) : (
          <TimeRail
            appointments={appointments}
            onCancel={(appointment) => void handleCancel(appointment)}
            cancellingId={cancellingId}
          />
        )}
      </Card>
    </div>
  );
}
