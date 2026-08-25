import type { Appointment, AppointmentSource, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { ErrorCode, ApiError } from '../../utils/apiError';
import { addMinutes, utcToZonedParts, zonedTimeToUtc } from '../../utils/time';
import { appointmentRepository } from '../../repositories/appointment.repository';
import type {
  CreateAppointmentInput,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from '../../schemas/appointment.schema';

/**
 * Appointment business logic.
 *
 * This is the *only* place appointments are created or modified. The manual
 * form and the AI conversation both normalise their input into
 * `CreateAppointmentInput` and call in here, so scheduling rules — timezone
 * conversion, past-date rejection, overlap detection — can never diverge
 * between the two flows.
 */

/** Shape returned to clients: an instant plus the local time it represents. */
export interface AppointmentView {
  id: string;
  appointmentType: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  timezone: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  status: Appointment['status'];
  source: Appointment['source'];
  createdAt: string;
  updatedAt: string;
}

export function toAppointmentView(appointment: Appointment): AppointmentView {
  const start = utcToZonedParts(appointment.startsAt, appointment.timezone);
  const end = utcToZonedParts(appointment.endsAt, appointment.timezone);

  return {
    id: appointment.id,
    appointmentType: appointment.appointmentType,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    durationMinutes: appointment.durationMinutes,
    timezone: appointment.timezone,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    notes: appointment.notes,
    status: appointment.status,
    source: appointment.source,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}

/** Guard against booking in the past, with a small grace window for clock skew. */
const PAST_GRACE_MS = 60_000;

function resolveWindow(date: string, startTime: string, durationMinutes: number, timezone: string) {
  const startsAt = zonedTimeToUtc(date, startTime, timezone);
  const endsAt = addMinutes(startsAt, durationMinutes);
  return { startsAt, endsAt };
}

async function assertSlotIsFree(
  userId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
): Promise<void> {
  const clashes = await appointmentRepository.findOverlapping(userId, startsAt, endsAt, excludeId);
  if (clashes.length > 0) {
    const clash = clashes[0]!;
    const local = utcToZonedParts(clash.startsAt, clash.timezone);
    throw ApiError.conflict(
      ErrorCode.APPOINTMENT_CONFLICT,
      `This overlaps your ${clash.appointmentType} appointment on ${local.date} at ${local.time}`,
    );
  }
}

export interface CreateOptions {
  source?: AppointmentSource;
}

export const appointmentService = {
  async create(
    userId: string,
    input: CreateAppointmentInput,
    options: CreateOptions = {},
  ): Promise<AppointmentView> {
    const timezone = input.timezone ?? env.DEFAULT_TIMEZONE;
    const { startsAt, endsAt } = resolveWindow(
      input.date,
      input.startTime,
      input.durationMinutes,
      timezone,
    );

    if (startsAt.getTime() < Date.now() - PAST_GRACE_MS) {
      throw ApiError.badRequest('Appointments cannot be booked in the past', [
        { field: 'date', message: 'Choose a future date and time' },
      ]);
    }

    await assertSlotIsFree(userId, startsAt, endsAt);

    const created = await appointmentRepository.create({
      userId,
      appointmentType: input.appointmentType,
      startsAt,
      endsAt,
      durationMinutes: input.durationMinutes,
      timezone,
      notes: input.notes ?? null,
      status: 'CONFIRMED',
      source: options.source ?? 'MANUAL',
    });

    return toAppointmentView(created);
  },

  async list(userId: string, query: ListAppointmentsQuery) {
    const where: Prisma.AppointmentWhereInput = {};

    if (query.status) where.status = query.status;

    const startsAtFilter: Prisma.DateTimeFilter = {};
    if (query.from) startsAtFilter.gte = new Date(`${query.from}T00:00:00.000Z`);
    if (query.to) startsAtFilter.lte = new Date(`${query.to}T23:59:59.999Z`);
    if (query.scope === 'upcoming') startsAtFilter.gte = new Date();
    if (query.scope === 'past') startsAtFilter.lt = new Date();
    if (Object.keys(startsAtFilter).length > 0) where.startsAt = startsAtFilter;

    const [rows, total] = await Promise.all([
      appointmentRepository.findMany(userId, where, query.limit, query.offset),
      appointmentRepository.count(userId, where),
    ]);

    return {
      appointments: rows.map(toAppointmentView),
      pagination: { total, limit: query.limit, offset: query.offset },
    };
  },

  async getById(userId: string, id: string): Promise<AppointmentView> {
    const appointment = await appointmentRepository.findOwned(id, userId);
    // Deliberately 404 rather than 403: a user should not be able to learn that
    // an id exists just because it belongs to somebody else.
    if (!appointment) throw ApiError.notFound('Appointment not found');
    return toAppointmentView(appointment);
  },

  async update(userId: string, id: string, input: UpdateAppointmentInput): Promise<AppointmentView> {
    const existing = await appointmentRepository.findOwned(id, userId);
    if (!existing) throw ApiError.notFound('Appointment not found');

    const data: Prisma.AppointmentUncheckedUpdateInput = {};

    if (input.appointmentType !== undefined) data.appointmentType = input.appointmentType;
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.status !== undefined) data.status = input.status;

    const timezone = input.timezone ?? existing.timezone;
    const durationMinutes = input.durationMinutes ?? existing.durationMinutes;
    const isRescheduling =
      input.date !== undefined ||
      input.startTime !== undefined ||
      input.durationMinutes !== undefined ||
      input.timezone !== undefined;

    if (isRescheduling) {
      const current = utcToZonedParts(existing.startsAt, existing.timezone);
      const date = input.date ?? current.date;
      const startTime = input.startTime ?? current.time;
      const { startsAt, endsAt } = resolveWindow(date, startTime, durationMinutes, timezone);

      const nextStatus = input.status ?? existing.status;
      if (nextStatus !== 'CANCELLED' && startsAt.getTime() < Date.now() - PAST_GRACE_MS) {
        throw ApiError.badRequest('Appointments cannot be moved into the past', [
          { field: 'date', message: 'Choose a future date and time' },
        ]);
      }

      if (nextStatus !== 'CANCELLED') {
        await assertSlotIsFree(userId, startsAt, endsAt, id);
      }

      data.startsAt = startsAt;
      data.endsAt = endsAt;
      data.durationMinutes = durationMinutes;
      data.timezone = timezone;
    }

    const updated = await appointmentRepository.updateOwned(id, userId, data);
    if (!updated) throw ApiError.notFound('Appointment not found');
    return toAppointmentView(updated);
  },

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await appointmentRepository.deleteOwned(id, userId);
    if (!deleted) throw ApiError.notFound('Appointment not found');
  },
};
