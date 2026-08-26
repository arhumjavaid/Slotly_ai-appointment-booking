import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SERVICE_CATALOGUE, toAvailabilityRows } from '../src/config/serviceCatalogue';
import { timeToDbTime } from '../src/utils/time';

/**
 * Development seed.
 *
 * Places appointments relative to today so the "upcoming" view is never empty,
 * and hashes the demo passwords at runtime rather than committing a fixed hash.
 * Idempotent — safe to re-run.
 *
 * Demo credentials (local development only):
 *   demo@slotly.test / DemoPassw0rd
 *   sam@slotly.test  / DemoPassw0rd
 */

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'DemoPassw0rd';

/** A UTC instant `days` from today at the given local wall-clock time. */
function at(days: number, time: string): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  const [hours, minutes] = time.split(':').map(Number);
  date.setUTCHours(hours ?? 0, minutes ?? 0, 0, 0);
  return date;
}

function plusMinutes(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60_000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Upserts the bookable services and replaces their opening hours.
 *
 * Rules are deleted and re-inserted rather than diffed: they are small,
 * wholly derived from the catalogue, and a partial update would leave stale
 * windows behind when a service's hours change.
 */
async function seedServiceCatalogue(): Promise<void> {
  for (const service of SERVICE_CATALOGUE) {
    const record = await prisma.serviceType.upsert({
      where: { slug: service.slug },
      update: {
        name: service.name,
        defaultDurationMinutes: service.defaultDurationMinutes,
        active: true,
      },
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

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }

  await seedServiceCatalogue();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Removing the users cascades to their appointments, sessions and messages.
  await prisma.user.deleteMany({
    where: { email: { in: ['demo@slotly.test', 'sam@slotly.test'] } },
  });

  const demo = await prisma.user.create({
    data: { name: 'Demo User', email: 'demo@slotly.test', passwordHash },
  });

  const sam = await prisma.user.create({
    data: { name: 'Sam Rivera', email: 'sam@slotly.test', passwordHash },
  });

  const appointments: Array<{
    userId: string;
    appointmentType: string;
    start: Date;
    durationMinutes: number;
    notes: string | null;
    status: Prisma.AppointmentCreateManyInput['status'];
    source: Prisma.AppointmentCreateManyInput['source'];
  }> = [
    {
      userId: demo.id,
      appointmentType: 'Dentist',
      start: at(1, '15:00'),
      durationMinutes: 30,
      notes: 'Routine check-up. Ask about the sensitivity on the left side.',
      status: 'CONFIRMED',
      source: 'AI',
    },
    {
      userId: demo.id,
      appointmentType: 'Physiotherapy',
      start: at(3, '09:00'),
      durationMinutes: 60,
      notes: 'Bring the exercise sheet from last time.',
      status: 'CONFIRMED',
      source: 'MANUAL',
    },
    {
      userId: demo.id,
      appointmentType: 'Haircut',
      start: at(6, '17:30'),
      durationMinutes: 30,
      notes: null,
      status: 'PENDING',
      source: 'MANUAL',
    },
    {
      userId: demo.id,
      appointmentType: 'Eye test',
      start: at(-9, '11:00'),
      durationMinutes: 30,
      notes: null,
      status: 'COMPLETED',
      source: 'MANUAL',
    },
    {
      userId: demo.id,
      appointmentType: 'Car service',
      start: at(-2, '08:00'),
      durationMinutes: 90,
      notes: 'Cancelled — rescheduling next month.',
      status: 'CANCELLED',
      source: 'MANUAL',
    },
    // Sam's appointment exists so the ownership scoping can be seen working:
    // it must never appear in the demo user's API responses.
    {
      userId: sam.id,
      appointmentType: 'Consultation',
      start: at(2, '14:00'),
      durationMinutes: 45,
      notes: 'Belongs to Sam, not to the demo user.',
      status: 'CONFIRMED',
      source: 'MANUAL',
    },
  ];

  await prisma.appointment.createMany({
    data: appointments.map((appointment) => ({
      userId: appointment.userId,
      appointmentType: appointment.appointmentType,
      startsAt: appointment.start,
      endsAt: plusMinutes(appointment.start, appointment.durationMinutes),
      durationMinutes: appointment.durationMinutes,
      timezone: 'UTC',
      notes: appointment.notes,
      status: appointment.status,
      source: appointment.source,
    })),
  });

  // A worked conversation matching the AI-booked dentist appointment above.
  const dentistDate = isoDate(at(1, '15:00'));

  await prisma.chatSession.create({
    data: {
      userId: demo.id,
      status: 'COMPLETED',
      draft: {
        appointmentType: 'Dentist',
        date: dentistDate,
        startTime: '15:00',
        durationMinutes: 30,
        notes: null,
        timezone: 'UTC',
      },
      messages: {
        create: [
          {
            role: 'ASSISTANT',
            content:
              'Hi — what would you like to book? Tell me the kind of appointment and when suits you.',
          },
          { role: 'USER', content: 'I want to book a dentist appointment tomorrow afternoon.' },
          { role: 'ASSISTANT', content: 'Sure. What time would you prefer?' },
          { role: 'USER', content: '3 PM.' },
          {
            role: 'ASSISTANT',
            content:
              'I have a dentist appointment tomorrow at 3:00 PM for 30 minutes. Should I confirm it?',
          },
          { role: 'USER', content: 'Yes.' },
          {
            role: 'ASSISTANT',
            content: `Booked — your Dentist appointment is confirmed for ${dentistDate} at 15:00.`,
          },
        ],
      },
      // Metadata only — matching what the application records at runtime.
      aiInteractions: {
        create: [
          {
            userId: demo.id,
            model: 'mistral-small-latest',
            requestMeta: {
              provider: 'mistral',
              turnCount: 3,
              historyTurns: 2,
              template: 'system_prompt.jinja',
            },
            responseMeta: { intent: 'book_appointment', attempts: 1, finishReason: 'stop' },
            latencyMs: 1180,
            success: true,
          },
          {
            userId: demo.id,
            model: 'mistral-small-latest',
            requestMeta: {
              provider: 'mistral',
              turnCount: 5,
              historyTurns: 4,
              template: 'system_prompt.jinja',
            },
            responseMeta: { intent: 'confirm_appointment', attempts: 1, finishReason: 'stop' },
            latencyMs: 964,
            success: true,
          },
        ],
      },
    },
  });

  console.log(
    `Seeded ${SERVICE_CATALOGUE.length} services with opening hours.\n` +
      `Seeded ${appointments.length} appointments across 2 demo accounts.\n` +
      `  demo@slotly.test / ${DEMO_PASSWORD}\n` +
      `  sam@slotly.test  / ${DEMO_PASSWORD}`,
  );
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
