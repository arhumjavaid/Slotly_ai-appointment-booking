'use client';

import Link from 'next/link';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { TimeRail } from '@/components/appointments/TimeRail';
import { cn } from '@/lib/format';
import { useAppointments } from '@/hooks/useAppointments';
import { useCurrentUser } from '@/hooks/useAuth';

function ChatIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-[18px] w-[18px]">
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5h9A2.5 2.5 0 0 1 17 7.5v4a2.5 2.5 0 0 1-2.5 2.5H8l-3.6 2.7A.5.5 0 0 1 3.6 16v-2.2A2.5 2.5 0 0 1 3 11.5v-4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FormIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-[18px] w-[18px]">
      <rect x="3.5" y="4" width="13" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.5 8h13M7 2.75v2.5M13 2.75v2.5M6.75 11.5h4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A booking route. The whole card is the target — the old markup nested a
 * <button> inside an <a>, which is invalid and gave the eye two things to aim
 * at for one destination.
 *
 * The assistant card wears the indigo accent and the manual card stays neutral,
 * so the palette itself says which surface the AI is behind.
 */
function BookingOption({
  title,
  description,
  detail,
  href,
  cta,
  icon,
  accent,
}: {
  title: string;
  description: string;
  detail: string;
  href: string;
  cta: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Link href={href} className="group block rounded-xl">
      <Card className="flex h-full flex-col p-5 transition-[box-shadow,border-color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:border-line-strong group-hover:shadow-lift">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
              accent ? 'bg-accent-soft text-accent' : 'bg-paper text-ink-2',
            )}
          >
            {icon}
          </span>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        </div>

        <p className="mt-3.5 text-[13px] leading-relaxed text-ink-2">{description}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{detail}</p>

        <span
          className={cn(
            'mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold',
            accent ? 'text-accent' : 'text-ink',
          )}
        >
          {cta}
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
          >
            <path
              d="M6 3.5 10.5 8 6 12.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useCurrentUser();
  const { data, isLoading, isError } = useAppointments({ scope: 'upcoming', limit: 6 });

  const upcoming = data?.appointments ?? [];
  // The list below is capped at six; the sentence is about everything upcoming,
  // so it counts the server's total rather than the page that came back.
  const upcomingTotal = data?.pagination.total ?? 0;
  const firstName = user?.name.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[34px] leading-tight text-ink">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {upcomingTotal > 0
            ? `You have ${upcomingTotal} appointment${upcomingTotal === 1 ? '' : 's'} coming up.`
            : 'Nothing on the calendar yet. Book something below.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BookingOption
          accent
          icon={<ChatIcon />}
          title="AI assistant"
          description="Book naturally through conversation."
          detail='Say something like "dentist tomorrow at 3pm" and the assistant fills in the details for you to confirm.'
          href="/assistant"
          cta="Start AI booking"
        />
        <BookingOption
          icon={<FormIcon />}
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
          <Link href="/appointments" className="text-[13px] font-medium text-navy hover:underline">
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
