import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/prisma';
import { SERVICE_CATALOGUE, toAvailabilityRows } from '../../src/config/serviceCatalogue';
import { timeToDbTime } from '../../src/utils/time';

export const app: Express = createApp();
export const api = () => request(app);

/**
 * Loads the service catalogue.
 *
 * Deliberately not part of `resetDatabase`: services are shared reference data
 * rather than per-test rows, so they are seeded once per suite and survive the
 * truncation between tests.
 */
export async function seedServiceCatalogue(): Promise<void> {
  for (const service of SERVICE_CATALOGUE) {
    const record = await prisma.serviceType.upsert({
      where: { slug: service.slug },
      update: { name: service.name, defaultDurationMinutes: service.defaultDurationMinutes },
      create: {
        name: service.name,
        slug: service.slug,
        defaultDurationMinutes: service.defaultDurationMinutes,
      },
    });

    await prisma.availabilityRule.deleteMany({ where: { serviceTypeId: record.id } });
    await prisma.availabilityRule.createMany({
      data: toAvailabilityRows(service).map((row) => ({
        serviceTypeId: record.id,
        weekday: row.weekday,
        startsAt: timeToDbTime(row.startTime),
        endsAt: timeToDbTime(row.endTime),
      })),
    });
  }
}

/**
 * Wipes all rows between tests. Cascades handle the dependent tables.
 *
 * The service catalogue is included, which means every suite starts with no
 * services and therefore no opening hours to enforce — bookings behave exactly
 * as they did before availability existed. Suites that want the rules call
 * `seedServiceCatalogue()` themselves. Safe because `fileParallelism` is off,
 * so no two suites share a database at the same moment.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE ai_interactions, chat_messages, chat_sessions, appointments, users, service_types RESTART IDENTITY CASCADE',
  );
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  cookie: string;
}

let counter = 0;

/** Registers a user and returns their session cookie. */
export async function createTestUser(overrides: Partial<{ email: string; password: string }> = {}): Promise<TestUser> {
  counter += 1;
  const email = overrides.email ?? `user${counter}.${Date.now()}@example.test`;
  const password = overrides.password ?? 'Passw0rdTest';

  const response = await api()
    .post('/api/auth/register')
    .send({ name: `Test User ${counter}`, email, password })
    .expect(201);

  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];

  return {
    id: response.body.data.user.id,
    email,
    password,
    cookie: cookies[0] as string,
  };
}

/** A date `days` from now as YYYY-MM-DD, so fixtures never fall into the past. */
export function futureDate(days = 2): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function validAppointmentPayload(overrides: Record<string, unknown> = {}) {
  return {
    appointmentType: 'Dentist',
    date: futureDate(),
    startTime: '15:00',
    durationMinutes: 30,
    timezone: 'UTC',
    ...overrides,
  };
}
