import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createTestUser,
  resetDatabase,
  seedServiceCatalogue,
  type TestUser,
} from '../helpers/testApp';
import { prisma } from '../../src/db/prisma';
import { extraction, StubProvider } from '../helpers/stubProvider';
import {
  SERVICE_CATALOGUE,
  WEEKDAY_NAMES,
  toAvailabilityRows,
} from '../../src/config/serviceCatalogue';
import { AiService } from '../../src/services/ai/ai.service';
import { ChatService } from '../../src/services/chat/chat.service';

/**
 * Opening hours, end to end.
 *
 * The seeded catalogue is the fixture, so the shapes under test are the ones a
 * reviewer sees on screen: Doctor works weekdays 09:00-12:00 and 14:00-18:00,
 * Physiotherapy only Monday/Wednesday/Friday, Dentist is closed at weekends.
 */

/** The next occurrence of `weekday` strictly in the future, as YYYY-MM-DD. */
function nextWeekday(weekday: number): string {
  const date = new Date();
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() !== weekday);
  return date.toISOString().slice(0, 10);
}

const MONDAY = 1;
const TUESDAY = 2;
const SUNDAY = 0;

describe('availability', () => {
  let user: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    await seedServiceCatalogue();
    user = await createTestUser();
  });

  afterAll(() => prisma.$disconnect());

  function book(overrides: Record<string, unknown>) {
    return api()
      .post('/api/appointments')
      .set('Cookie', user.cookie)
      .send({ durationMinutes: 30, ...overrides });
  }

  describe('GET /api/availability', () => {
    it('returns every active service with a full week of hours', async () => {
      const response = await api().get('/api/availability').set('Cookie', user.cookie).expect(200);

      const { services } = response.body.data;
      expect(services).toHaveLength(7);

      const doctor = services.find((s: { slug: string }) => s.slug === 'doctor');
      expect(doctor.defaultDurationMinutes).toBe(30);
      // Seven entries so a client can render a week without filling gaps itself.
      expect(doctor.days).toHaveLength(7);
      expect(doctor.days[MONDAY].windows).toEqual([
        { startTime: '09:00', endTime: '12:00' },
        { startTime: '14:00', endTime: '18:00' },
      ]);
      expect(doctor.days[SUNDAY].windows).toEqual([]);
    });

    it('requires authentication', async () => {
      await api().get('/api/availability').expect(401);
    });
  });

  describe('enforcement on the manual path', () => {
    it('accepts a time inside an open window', async () => {
      await book({ appointmentType: 'Doctor', date: nextWeekday(MONDAY), startTime: '09:30' })
        .expect(201);
    });

    it('accepts a booking that starts exactly when the window opens', async () => {
      await book({ appointmentType: 'Doctor', date: nextWeekday(MONDAY), startTime: '09:00' })
        .expect(201);
    });

    it('accepts a booking that ends exactly when the window closes', async () => {
      await book({ appointmentType: 'Doctor', date: nextWeekday(MONDAY), startTime: '11:30' })
        .expect(201);
    });

    it('rejects a time in the middle of the lunch break', async () => {
      const response = await book({
        appointmentType: 'Doctor',
        date: nextWeekday(MONDAY),
        startTime: '13:00',
      }).expect(409);

      expect(response.body.error.code).toBe('OUTSIDE_AVAILABILITY');
      // The message has to carry the real windows, because it is what the
      // assistant reads back to the user.
      expect(response.body.error.message).toContain('09:00-12:00 and 14:00-18:00');
    });

    it('rejects a booking that straddles the break rather than fitting one window', async () => {
      // 11:30 + 60 minutes runs to 12:30, past the morning close. Only a
      // booking that fits entirely inside one window is allowed.
      const response = await book({
        appointmentType: 'Doctor',
        date: nextWeekday(MONDAY),
        startTime: '11:30',
        durationMinutes: 60,
      }).expect(409);

      expect(response.body.error.code).toBe('OUTSIDE_AVAILABILITY');
    });

    it('rejects a day the service is closed', async () => {
      const response = await book({
        appointmentType: 'Doctor',
        date: nextWeekday(SUNDAY),
        startTime: '10:00',
      }).expect(409);

      expect(response.body.error.message).toContain('closed on Sundays');
      // The date is the field at fault, so the form marks that input.
      expect(response.body.error.details[0].field).toBe('date');
    });

    it('rejects rescheduling into a closed period', async () => {
      const created = await book({
        appointmentType: 'Doctor',
        date: nextWeekday(MONDAY),
        startTime: '09:00',
      }).expect(201);

      // PATCH has to clear the same bar as POST, or it is a way around the rule.
      const response = await api()
        .patch(`/api/appointments/${created.body.data.appointment.id}`)
        .set('Cookie', user.cookie)
        .send({ date: nextWeekday(MONDAY), startTime: '13:00' })
        .expect(409);

      expect(response.body.error.code).toBe('OUTSIDE_AVAILABILITY');
    });
  });

  describe('matching an appointment type to a service', () => {
    it('matches an abbreviation to the service it prefixes', async () => {
      // Physiotherapy is closed on Tuesdays, so a rejection proves "physio"
      // resolved rather than falling through as unconstrained text.
      const response = await book({
        appointmentType: 'physio',
        date: nextWeekday(TUESDAY),
        startTime: '10:00',
      }).expect(409);

      expect(response.body.error.message).toContain('Physiotherapy');
    });

    it('matches a service mentioned inside a longer phrase', async () => {
      const response = await book({
        appointmentType: 'Dentist appointment',
        date: nextWeekday(SUNDAY),
        startTime: '10:00',
      }).expect(409);

      expect(response.body.error.message).toContain('Dentist');
    });

    it('leaves an appointment type that matches nothing unconstrained', async () => {
      // The catalogue is a source of rules, not a whitelist: anything it does
      // not recognise books exactly as it did before availability existed.
      await book({
        appointmentType: 'Mechanic',
        date: nextWeekday(SUNDAY),
        startTime: '03:00',
      }).expect(201);
    });
  });
});

describe('the assistant and opening hours', () => {
  let user: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    await seedServiceCatalogue();
    user = await createTestUser();
  });

  function chatWith(provider: StubProvider): ChatService {
    return new ChatService(new AiService(provider));
  }

  it('gives the model the catalogue as fact', async () => {
    const provider = new StubProvider([extraction({ reply: 'Sure — what time?' })]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    await service.sendMessage(user.id, session.id, 'I need a doctor', 'UTC');

    const systemPrompt = provider.calls[0]!.messages[0]!.content;
    expect(systemPrompt).toContain('Doctor (30 min)');
    expect(systemPrompt).toContain('Mon-Fri 09:00-12:00 and 14:00-18:00');
  });

  it('overrides the model when it proposes a closed time', async () => {
    const date = nextWeekday(MONDAY);
    // The model is scripted to be confidently wrong: 13:00 is the lunch break.
    const provider = new StubProvider([
      extraction({
        reply: 'Great — a doctor on that date at 1:00 PM. Shall I confirm?',
        appointmentType: 'Doctor',
        date,
        startTime: '13:00',
        durationMinutes: 30,
      }),
    ]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    const result = await service.sendMessage(user.id, session.id, 'doctor at 1pm', 'UTC');

    // The user never sees the model's sentence.
    expect(result.message.content).not.toContain('Shall I confirm');
    expect(result.message.content).toContain('09:00-12:00 and 14:00-18:00');

    // The bad time is dropped, so the conversation asks for it again.
    expect(result.draft.startTime).toBeNull();
    expect(result.draft.appointmentType).toBe('Doctor');
    expect(result.missingFields).toContain('startTime');
    expect(result.readyToConfirm).toBe(false);
    await expect(prisma.appointment.count()).resolves.toBe(0);
  });

  it('refuses to promote a closed time even when the model claims confirmation', async () => {
    const date = nextWeekday(SUNDAY);
    const provider = new StubProvider([
      extraction({
        intent: 'confirm_appointment',
        reply: 'Booked! Your doctor appointment is confirmed.',
        appointmentType: 'Doctor',
        date,
        startTime: '10:00',
        durationMinutes: 30,
      }),
    ]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    const result = await service.sendMessage(user.id, session.id, 'yes book it', 'UTC');

    expect(result.appointment).toBeNull();
    expect(result.message.content).toContain('closed on Sundays');
    await expect(prisma.appointment.count()).resolves.toBe(0);
  });

  it('drops the date when the service is closed all day, not just the time', async () => {
    // Keeping the date would leave the summary panel showing a Sunday the
    // assistant has just refused, and invite the user to pick a time on a day
    // where no time can work.
    const provider = new StubProvider([
      extraction({
        reply: 'Dentist on Sunday at 3 PM. Shall I confirm?',
        appointmentType: 'Dentist',
        date: nextWeekday(SUNDAY),
        startTime: '15:00',
        durationMinutes: 30,
      }),
    ]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    const result = await service.sendMessage(
      user.id,
      session.id,
      'i want to book dentist on sunday at 3pm',
      'UTC',
    );

    expect(result.draft.date).toBeNull();
    expect(result.missingFields).toContain('date');
    // The time is still usable on an open day, so it is kept.
    expect(result.draft.startTime).toBe('15:00');
    expect(result.draft.appointmentType).toBe('Dentist');
    expect(result.readyToConfirm).toBe(false);
  });

  it('rejects a closed day before a time has even been chosen', async () => {
    // The exact sequence from the bug report: the user switches service to one
    // that is also closed that day, and gives no time. Waiting for a time
    // would mean asking "what time on Sunday?" about a day with no open hours.
    const provider = new StubProvider([
      extraction({
        reply: 'What time on Sunday?',
        appointmentType: 'Doctor',
        date: nextWeekday(SUNDAY),
        startTime: null,
        missingFields: ['startTime'],
      }),
    ]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    const result = await service.sendMessage(user.id, session.id, 'ok then doctor on sunday', 'UTC');

    expect(result.message.content).not.toContain('What time on Sunday');
    expect(result.message.content).toContain('closed on Sundays');
    expect(result.draft.date).toBeNull();
    expect(result.missingFields).toContain('date');
  });

  it('accepts an open day that has no time yet', async () => {
    const provider = new StubProvider([
      extraction({
        reply: 'What time on Monday?',
        appointmentType: 'Doctor',
        date: nextWeekday(MONDAY),
        startTime: null,
        missingFields: ['startTime'],
      }),
    ]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    const result = await service.sendMessage(user.id, session.id, 'doctor on monday', 'UTC');

    // Nothing to object to yet, so the model's question stands.
    expect(result.message.content).toBe('What time on Monday?');
    expect(result.draft.date).toBe(nextWeekday(MONDAY));
    expect(result.missingFields).toEqual(['startTime']);
  });

  it('drops only the time when the day is open but the hour is not', async () => {
    const provider = new StubProvider([
      extraction({
        reply: 'Doctor at 1 PM. Shall I confirm?',
        appointmentType: 'Doctor',
        date: nextWeekday(MONDAY),
        startTime: '13:00',
        durationMinutes: 30,
      }),
    ]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    const result = await service.sendMessage(user.id, session.id, 'doctor at 1pm', 'UTC');

    expect(result.draft.date).toBe(nextWeekday(MONDAY));
    expect(result.draft.startTime).toBeNull();
    expect(result.missingFields).toContain('startTime');
  });

  it('lets an in-hours booking through untouched', async () => {
    const date = nextWeekday(MONDAY);
    const provider = new StubProvider([
      extraction({
        reply: 'A doctor on that date at 10:00 AM for 30 minutes. Shall I confirm?',
        appointmentType: 'Doctor',
        date,
        startTime: '10:00',
        durationMinutes: 30,
      }),
    ]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    const result = await service.sendMessage(user.id, session.id, 'doctor at 10am', 'UTC');

    expect(result.message.content).toContain('Shall I confirm');
    expect(result.readyToConfirm).toBe(true);
    expect(result.draft.startTime).toBe('10:00');
  });

  it('builds the availability list itself rather than trusting the model', async () => {
    // The model supplies a lead-in only; if it invents times, they are ignored.
    const provider = new StubProvider([
      extraction({
        intent: 'check_availability',
        reply: 'Here is what I can book:',
        appointmentType: null,
      }),
    ]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    const result = await service.sendMessage(user.id, session.id, 'list them all', 'UTC');

    const structured = result.message.structured as { availability: Array<{ name: string; hours: string[] }> };
    expect(structured.availability).toHaveLength(7);

    const doctor = structured.availability.find((s) => s.name === 'Doctor')!;
    expect(doctor.hours).toEqual(['Mon-Fri 09:00-12:00 and 14:00-18:00']);

    // The stored text carries the same list, one service per block, so a
    // transcript read without the structured payload is still complete.
    expect(result.message.content).toContain('Here is what I can book:');
    expect(result.message.content).toContain('Doctor (30 min)\n  Mon-Fri 09:00-12:00 and 14:00-18:00');
  });

  it('narrows the list to the service the user named in their message', async () => {
    // The model leaves appointmentType null when the user is asking rather
    // than booking, so the narrowing has to come from their own words.
    const provider = new StubProvider([
      extraction({
        intent: 'check_availability',
        reply: 'Here are the haircut hours:',
        appointmentType: null,
      }),
    ]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    const result = await service.sendMessage(
      user.id,
      session.id,
      'what are the opening hours for a haircut?',
      'UTC',
    );

    const structured = result.message.structured as { availability: Array<{ name: string; hours: string[] }> };
    expect(structured.availability).toHaveLength(1);
    expect(structured.availability[0]!.name).toBe('Haircut');
    expect(structured.availability[0]!.hours).toEqual([
      'Tue-Fri 10:00-19:00',
      'Sat 09:00-16:00',
    ]);
  });

  it('does not book anything while answering an availability question', async () => {
    const provider = new StubProvider([
      extraction({ intent: 'check_availability', reply: 'Here you go:' }),
    ]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    const result = await service.sendMessage(user.id, session.id, 'what can I book?', 'UTC');

    expect(result.appointment).toBeNull();
    expect(result.sessionStatus).toBe('ACTIVE');
    await expect(prisma.appointment.count()).resolves.toBe(0);
  });

  it('lists everything when the question names no service', async () => {
    const provider = new StubProvider([
      extraction({ intent: 'check_availability', reply: 'Here you go:', appointmentType: null }),
    ]);
    const service = chatWith(provider);
    const session = await service.createSession(user.id, 'UTC');

    const result = await service.sendMessage(user.id, session.id, 'what can I book?', 'UTC');

    const structured = result.message.structured as { availability: unknown[] };
    expect(structured.availability).toHaveLength(7);
  });
});

/**
 * Every service, every day of the week.
 *
 * The rules above are checked against Doctor and Dentist by name. This walks
 * the whole catalogue instead, deriving what *should* happen from the seed
 * definition rather than restating it — so a service with an unusual shape
 * (Dermatologist opens two days a week, Physiotherapy splits its day three
 * times a week) is covered by construction, and adding one to the catalogue
 * extends the coverage automatically.
 */
describe('every service is held to its own hours', () => {
  let user: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    await seedServiceCatalogue();
    user = await createTestUser();
  });

  afterAll(() => prisma.$disconnect());

  /** The next date falling on `weekday`, strictly in the future. */
  function dateFor(weekday: number): string {
    return nextWeekday(weekday);
  }

  async function statusFor(appointmentType: string, date: string, startTime: string) {
    const response = await api()
      .post('/api/appointments')
      .set('Cookie', user.cookie)
      .send({ appointmentType, date, startTime, durationMinutes: 30 });
    return response.status;
  }

  for (const service of SERVICE_CATALOGUE) {
    it(`${service.name}`, async () => {
      const rows = toAvailabilityRows(service);
      const actual: string[] = [];
      const expected: string[] = [];

      for (let weekday = 0; weekday < 7; weekday += 1) {
        const day = WEEKDAY_NAMES[weekday]!.slice(0, 3);
        const windows = rows
          .filter((row) => row.weekday === weekday)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        const date = dateFor(weekday);

        if (windows.length === 0) {
          expected.push(`${day} 10:00 rejected`);
          actual.push(`${day} 10:00 ${(await statusFor(service.name, date, '10:00')) === 409 ? 'rejected' : 'accepted'}`);
          continue;
        }

        // Opening minute of the first window: the boundary most likely to be
        // off by one if the comparison were done on strings or local dates.
        const opensAt = windows[0]!.startTime;
        expected.push(`${day} ${opensAt} accepted`);
        actual.push(`${day} ${opensAt} ${(await statusFor(service.name, date, opensAt)) === 201 ? 'accepted' : 'rejected'}`);

        // 05:00 is before every window in the catalogue, so an open day must
        // still refuse it.
        expected.push(`${day} 05:00 rejected`);
        actual.push(`${day} 05:00 ${(await statusFor(service.name, date, '05:00')) === 409 ? 'rejected' : 'accepted'}`);
      }

      expect(actual).toEqual(expected);
    });
  }
});
