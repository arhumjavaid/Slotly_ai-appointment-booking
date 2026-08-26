'use client';

import Link from 'next/link';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useAvailability } from '@/hooks/useAvailability';
import { errorMessage } from '@/lib/api';
import { formatDuration, toHoursRows } from '@/lib/format';
import type { ServiceType } from '@/types/api';

export default function AvailabilityPage() {
  const { data, isLoading, isError, error } = useAvailability();
  const services = data?.services ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] leading-tight text-ink">Availability</h1>
          <p className="mt-1 text-sm text-ink-2">
            When each service can be booked. The assistant works to these hours too.
          </p>
        </div>
        <Link href="/assistant">
          <Button size="sm">Ask the assistant</Button>
        </Link>
      </div>

      {isError && <Alert tone="error">{errorMessage(error, "Couldn't load availability.")}</Alert>}

      {isLoading ? (
        <Card>
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        </Card>
      ) : services.length === 0 ? (
        <Card>
          <EmptyState
            title="No services configured"
            description="Once services are set up, their opening hours will appear here."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceType }) {
  const rows = toHoursRows(service);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-[19px] leading-tight text-ink">{service.name}</h2>
        <Badge className="bg-navy-soft text-navy">
          {formatDuration(service.defaultDurationMinutes)}
        </Badge>
      </div>

      <dl className="mt-4 space-y-1.5">
        {rows.map((row) => (
          <div key={row.days} className="flex items-baseline gap-3 text-[13px]">
            {/* Fixed-width term keeps the hours aligned down the column. */}
            <dt className="w-16 shrink-0 font-medium text-ink-3">{row.days}</dt>
            <dd className={row.hours ? 'text-ink' : 'text-ink-3'}>{row.hours ?? 'Closed'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
