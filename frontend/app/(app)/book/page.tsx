'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card } from '@/components/ui';
import { ManualBookingForm } from '@/components/appointments/ManualBookingForm';
import { formatFullDate, formatTimeLabel } from '@/lib/format';
import type { Appointment } from '@/types/api';

export default function ManualBookingPage() {
  const [lastBooked, setLastBooked] = useState<Appointment | null>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/dashboard" className="text-[13px] text-ink-3 hover:text-ink">
          ← Dashboard
        </Link>
        <h1 className="mt-3 font-display text-[32px] leading-tight text-ink">Book an appointment</h1>
        <p className="mt-1 text-sm text-ink-2">
          Fill in the details and it goes straight on the calendar.
        </p>
      </div>

      {lastBooked && (
        <Alert
          tone="success"
          title="Appointment booked"
          action={
            <Link href="/appointments">
              <Button variant="secondary" size="sm">
                View appointments
              </Button>
            </Link>
          }
        >
          {lastBooked.appointmentType} on {formatFullDate(lastBooked.date)} at{' '}
          {formatTimeLabel(lastBooked.startTime)}.
        </Alert>
      )}

      <Card className="p-6">
        <ManualBookingForm onBooked={setLastBooked} />
      </Card>

      <p className="text-[13px] text-ink-3">
        Prefer to describe it instead?{' '}
        <Link href="/assistant" className="font-medium text-accent hover:underline">
          Use the AI assistant
        </Link>
        .
      </p>
    </div>
  );
}
