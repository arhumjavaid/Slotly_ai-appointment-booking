'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { useCreateAppointment } from '@/hooks/useAppointments';
import type { Appointment } from '@/types/api';

/**
 * Client-side schema.
 *
 * This exists for immediate feedback while typing — it is not a security
 * boundary. The backend re-validates every one of these rules with its own Zod
 * schema, which is the authoritative one.
 */
const bookingFormSchema = z.object({
  appointmentType: z
    .string()
    .trim()
    .min(2, 'Enter what the appointment is for')
    .max(120, 'Keep this under 120 characters'),
  date: z.string().min(1, 'Choose a date'),
  startTime: z.string().min(1, 'Choose a start time'),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  notes: z.string().trim().max(1000, 'Keep notes under 1000 characters').optional(),
});

type BookingFormValues = z.input<typeof bookingFormSchema>;

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];

const SUGGESTED_TYPES = ['Dentist', 'Doctor', 'Haircut', 'Consultation', 'Physiotherapy'];

function todayIsoDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

interface ManualBookingFormProps {
  onBooked?: (appointment: Appointment) => void;
  /** Pre-fills the form when handing over from a stalled chat. */
  defaults?: Partial<BookingFormValues>;
}

export function ManualBookingForm({ onBooked, defaults }: ManualBookingFormProps) {
  const createAppointment = useCreateAppointment();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      appointmentType: defaults?.appointmentType ?? '',
      date: defaults?.date ?? todayIsoDate(),
      startTime: defaults?.startTime ?? '09:00',
      durationMinutes: defaults?.durationMinutes ?? 30,
      notes: defaults?.notes ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { appointment } = await createAppointment.mutateAsync({
        appointmentType: values.appointmentType,
        date: values.date,
        startTime: values.startTime,
        durationMinutes: Number(values.durationMinutes),
        notes: values.notes?.trim() ? values.notes.trim() : null,
      });

      reset({ ...values, appointmentType: '', notes: '' });
      onBooked?.(appointment);
    } catch (error) {
      // Field-level errors from the server are attached to their inputs so the
      // user sees them where the problem is, not only in a banner.
      if (error instanceof ApiError && error.details.length > 0) {
        for (const detail of error.details) {
          if (detail.field in bookingFormSchema.shape) {
            setError(detail.field as keyof BookingFormValues, { message: detail.message });
          }
        }
      }
      throw error;
    }
  });

  const serverError =
    createAppointment.error instanceof ApiError ? createAppointment.error : null;
  const showBanner = Boolean(serverError) && !createAppointment.isPending;

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-5">
      {showBanner && serverError && (
        <Alert tone="error" title={serverError.code === 'APPOINTMENT_CONFLICT' ? 'Time already taken' : "Couldn't book that"}>
          {serverError.message}
        </Alert>
      )}

      <Field label="What is it for?" htmlFor="appointmentType" error={errors.appointmentType?.message}>
        <Input
          id="appointmentType"
          list="appointment-type-suggestions"
          placeholder="Dentist"
          autoComplete="off"
          invalid={Boolean(errors.appointmentType)}
          {...register('appointmentType')}
        />
        <datalist id="appointment-type-suggestions">
          {SUGGESTED_TYPES.map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Date" htmlFor="date" error={errors.date?.message}>
          <Input id="date" type="date" min={todayIsoDate()} invalid={Boolean(errors.date)} {...register('date')} />
        </Field>

        <Field label="Start time" htmlFor="startTime" error={errors.startTime?.message}>
          <Input
            id="startTime"
            type="time"
            step={300}
            invalid={Boolean(errors.startTime)}
            {...register('startTime')}
          />
        </Field>

        <Field label="Duration" htmlFor="durationMinutes" error={errors.durationMinutes?.message}>
          <Select id="durationMinutes" invalid={Boolean(errors.durationMinutes)} {...register('durationMinutes')}>
            {DURATION_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes > 60 ? 's' : ''}`}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Notes"
        htmlFor="notes"
        error={errors.notes?.message}
        hint="Optional — anything you want to remember about this appointment."
      >
        <Textarea id="notes" rows={3} invalid={Boolean(errors.notes)} {...register('notes')} />
      </Field>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" loading={isSubmitting || createAppointment.isPending}>
          Book appointment
        </Button>
        <p className="text-[13px] text-ink-3">Times are in your local timezone.</p>
      </div>
    </form>
  );
}
