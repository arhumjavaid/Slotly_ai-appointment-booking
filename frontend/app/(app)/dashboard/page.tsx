'use client';

import Link from 'next/link';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { TimeRail } from '@/components/appointments/TimeRail';
import { useAppointments } from '@/hooks/useAppointments';
import { useCurrentUser } from '@/hooks/useAuth';

function BookingOption({
  title,
  description,
  detail,
  href,
  cta,
  primary,
}: {
  title: string;
  description: string;
  detail: string;
  href: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <Card className="flex flex-col p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{description}</p>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{detail}</p>
      <div className="mt-5 pt-1">
        <Link href={href}>
          <Button variant={primary ? 'primary' : 'secondary'}>{cta}</Button>
        </Link>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useCurrentUser();
  const { data, isLoading, isError } = useAppointments({ scope: 'upcoming', limit: 6 });

  const upcoming = data?.appointments ?? [];
  const firstName = user?.name.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[34px] leading-tight text-ink">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {upcoming.length > 0
            ? `You have ${upcoming.length} appointment${upcoming.length === 1 ? '' : 's'} coming up.`
            : 'Nothing on the calendar yet. Book something below.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BookingOption
          primary
          title="AI assistant"
          description="Book naturally through conversation."
          detail='Say something like "dentist tomorrow at 3pm" and the assistant fills in the details for you to confirm.'
          href="/assistant"
          cta="Start AI booking"
        />
        <BookingOption
          title="Manual booking"
          description="Enter appointment details yourself."
          detail="A short form with the type, date, time and duration. Fastest when you already know exactly what you want."
          href="/book"
          cta="Book manually"
        />
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink">Upcoming</h2>
          <Link href="/appointments" className="text-[13px] font-medium text-accent hover:underline">
            View all
          </Link>
        </div>

        <Card>
          {isLoading ? (
            <div className="flex items-center justify-center py-14">
              <Spinner className="text-ink-3" />
              <span className="sr-only">Loading appointments</span>
            </div>
          ) : isError ? (
            <EmptyState
              title="Couldn't load your appointments"
              description="The server didn't respond. Refresh the page to try again."
            />
          ) : upcoming.length === 0 ? (
            <EmptyState
              title="No appointments yet"
              description="Once you book something, it will show up here with the time and duration."
              action={
                <Link href="/book">
                  <Button size="sm">Book an appointment</Button>
                </Link>
              }
            />
          ) : (
            <TimeRail appointments={upcoming} />
          )}
        </Card>
      </section>
    </div>
  );
}
