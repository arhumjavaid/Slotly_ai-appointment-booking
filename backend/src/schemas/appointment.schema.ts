import { z } from 'zod';
import { dateStringSchema, durationSchema, timeStringSchema, timezoneSchema } from './common.schema';

export const APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] as const;
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);

const appointmentTypeSchema = z
  .string()
  .trim()
  .min(2, 'Appointment type must be at least 2 characters')
  .max(120, 'Appointment type must be at most 120 characters');

const notesSchema = z.string().trim().max(1000, 'Notes must be at most 1000 characters');

/**
 * The single canonical shape for creating an appointment.
 *
 * Both the manual form and the AI-extracted draft are normalised into this
 * before reaching the appointment service, which is what keeps the two flows
 * on one code path.
 */
export const createAppointmentSchema = z.object({
  appointmentType: appointmentTypeSchema,
  date: dateStringSchema,
  startTime: timeStringSchema,
  durationMinutes: durationSchema,
  notes: notesSchema.optional().nullable(),
  timezone: timezoneSchema.optional(),
});

export const updateAppointmentSchema = z
  .object({
    appointmentType: appointmentTypeSchema.optional(),
    date: dateStringSchema.optional(),
    startTime: timeStringSchema.optional(),
    durationMinutes: durationSchema.optional(),
    notes: notesSchema.optional().nullable(),
    timezone: timezoneSchema.optional(),
    status: appointmentStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .refine(
    // Rescheduling needs both halves of the local wall-clock time, otherwise the
    // resulting instant would silently mix an old date with a new time.
    (value) => (value.date === undefined) === (value.startTime === undefined),
    { message: 'Date and start time must be changed together', path: ['startTime'] },
  );

export const listAppointmentsQuerySchema = z.object({
  status: appointmentStatusSchema.optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  scope: z.enum(['all', 'upcoming', 'past']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;
