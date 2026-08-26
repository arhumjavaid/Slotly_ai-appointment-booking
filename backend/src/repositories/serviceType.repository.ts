import type { AvailabilityRule, ServiceType } from '@prisma/client';
import { prisma } from '../db/prisma';

export type ServiceTypeWithRules = ServiceType & { availabilityRules: AvailabilityRule[] };

/**
 * Data access for the service catalogue.
 *
 * Unlike appointments, services are shared reference data rather than
 * per-user rows, so nothing here is scoped by owner. Rules always travel with
 * their service: every caller that wants one wants the other, and loading them
 * together avoids a second round trip per service.
 */
export const serviceTypeRepository = {
  listActive(): Promise<ServiceTypeWithRules[]> {
    return prisma.serviceType.findMany({
      where: { active: true },
      include: { availabilityRules: { orderBy: [{ weekday: 'asc' }, { startsAt: 'asc' }] } },
      orderBy: { name: 'asc' },
    });
  },
};
