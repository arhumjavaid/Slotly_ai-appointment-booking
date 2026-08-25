import type { Appointment, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

/**
 * Data access for appointments.
 *
 * Every read and write is scoped by `userId` at the query level. Ownership is
 * therefore enforced by the database predicate itself rather than by a check a
 * caller could forget — a lookup for someone else's id simply returns nothing.
 */
export const appointmentRepository = {
  create(data: Prisma.AppointmentUncheckedCreateInput): Promise<Appointment> {
    return prisma.appointment.create({ data });
  },

  findOwned(id: string, userId: string): Promise<Appointment | null> {
    return prisma.appointment.findFirst({ where: { id, userId } });
  },

  findMany(userId: string, where: Prisma.AppointmentWhereInput, limit: number, offset: number) {
    return prisma.appointment.findMany({
      where: { ...where, userId },
      orderBy: { startsAt: 'asc' },
      take: limit,
      skip: offset,
    });
  },

  count(userId: string, where: Prisma.AppointmentWhereInput): Promise<number> {
    return prisma.appointment.count({ where: { ...where, userId } });
  },

  /**
   * Returns appointments for the user that overlap the given window.
   * Cancelled appointments free their slot, so they are excluded.
   */
  findOverlapping(
    userId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
  ): Promise<Appointment[]> {
    return prisma.appointment.findMany({
      where: {
        userId,
        status: { not: 'CANCELLED' },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      take: 1,
    });
  },

  async updateOwned(
    id: string,
    userId: string,
    data: Prisma.AppointmentUncheckedUpdateInput,
  ): Promise<Appointment | null> {
    // updateMany applies the ownership predicate atomically; a row count of 0
    // means the appointment does not exist *or* is not ours — both are 404.
    const result = await prisma.appointment.updateMany({ where: { id, userId }, data });
    if (result.count === 0) return null;
    return prisma.appointment.findFirst({ where: { id, userId } });
  },

  async deleteOwned(id: string, userId: string): Promise<boolean> {
    const result = await prisma.appointment.deleteMany({ where: { id, userId } });
    return result.count > 0;
  },
};
