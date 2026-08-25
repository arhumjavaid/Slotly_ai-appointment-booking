import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, futureDate, resetDatabase, type TestUser } from '../helpers/testApp';
import { extraction, StubProvider, unavailableProvider } from '../helpers/stubProvider';
import { prisma } from '../../src/db/prisma';
import { AiService } from '../../src/services/ai/ai.service';
import { ChatService } from '../../src/services/chat/chat.service';

function chatWith(provider: StubProvider): ChatService {
  return new ChatService(new AiService(provider));
}

describe('AI booking conversation', () => {
  let user: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    user = await createTestUser();
  });

  afterAll(() => prisma.$disconnect());

  async function startSession(service: ChatService): Promise<string> {
    const session = await service.createSession(user.id, 'UTC');
    return session.id;
  }

  describe('a complete request', () => {
    it('collects every detail in one turn and offers a confirmation', async () => {
      const date = futureDate(1);
      const provider = new StubProvider([
        extraction({
          reply: `I have a dentist appointment on ${date} at 3:00 PM for 30 minutes. Shall I confirm?`,
          appointmentType: 'Dentist',
          date,
          startTime: '15:00',
          durationMinutes: 30,
        }),
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      const result = await service.sendMessage(
        user.id,
        sessionId,
        'I need a dentist appointment tomorrow at 3 PM',
        'UTC',
      );

      expect(result.missingFields).toHaveLength(0);
      expect(result.readyToConfirm).toBe(true);
      expect(result.draft).toMatchObject({ appointmentType: 'Dentist', date, startTime: '15:00' });

      // Crucially: proposing is not booking.
      expect(result.appointment).toBeNull();
      await expect(prisma.appointment.count()).resolves.toBe(0);
    });

    it('creates the appointment only once the user confirms', async () => {
      const date = futureDate(1);
      const provider = new StubProvider([
        extraction({ appointmentType: 'Dentist', date, startTime: '15:00', durationMinutes: 30 }),
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      await service.sendMessage(user.id, sessionId, 'Dentist tomorrow at 3pm', 'UTC');
      const appointment = await service.confirmDraft(user.id, sessionId);

      expect(appointment).toMatchObject({
        appointmentType: 'Dentist',
        date,
        startTime: '15:00',
        endTime: '15:30',
        status: 'CONFIRMED',
        source: 'AI',
      });

      await expect(prisma.appointment.count()).resolves.toBe(1);
      const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
      expect(session?.status).toBe('COMPLETED');
    });

    it('books when the user confirms conversationally', async () => {
      const date = futureDate(1);
      const provider = new StubProvider([
        extraction({ appointmentType: 'Dentist', date, startTime: '15:00', durationMinutes: 30 }),
        extraction({ intent: 'confirm_appointment', reply: 'Confirming that now.' }),
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      await service.sendMessage(user.id, sessionId, 'Dentist tomorrow at 3pm', 'UTC');
      const result = await service.sendMessage(user.id, sessionId, 'Yes', 'UTC');

      expect(result.appointment).not.toBeNull();
      expect(result.appointment?.source).toBe('AI');
      expect(result.sessionStatus).toBe('COMPLETED');
    });
  });

  describe('an incomplete request', () => {
    it('asks for the missing time instead of inventing one', async () => {
      const date = futureDate(1);
      const provider = new StubProvider([
        extraction({
          reply: 'Sure — what time would you prefer?',
          appointmentType: 'Dentist',
          date,
          missingFields: ['startTime'],
          needsClarification: true,
        }),
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      const result = await service.sendMessage(
        user.id,
        sessionId,
        'I need a dentist appointment tomorrow',
        'UTC',
      );

      expect(result.missingFields).toEqual(['startTime']);
      expect(result.readyToConfirm).toBe(false);
      expect(result.draft.startTime).toBeNull();
      await expect(prisma.appointment.count()).resolves.toBe(0);
    });

    it('carries details across turns, so the user never repeats themselves', async () => {
      const date = futureDate(1);
      const provider = new StubProvider([
        extraction({ appointmentType: 'Dentist', date, missingFields: ['startTime'] }),
        // Second turn returns only the new value, as models routinely do.
        extraction({ startTime: '15:00', durationMinutes: 30 }),
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      await service.sendMessage(user.id, sessionId, 'Dentist tomorrow', 'UTC');
      const result = await service.sendMessage(user.id, sessionId, '3 PM', 'UTC');

      expect(result.draft).toMatchObject({ appointmentType: 'Dentist', date, startTime: '15:00' });
      expect(result.readyToConfirm).toBe(true);
    });

    it('refuses to confirm a draft that is still incomplete', async () => {
      const provider = new StubProvider([
        extraction({ appointmentType: 'Dentist', missingFields: ['date', 'startTime'] }),
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      await service.sendMessage(user.id, sessionId, 'I need a dentist', 'UTC');

      await expect(service.confirmDraft(user.id, sessionId)).rejects.toMatchObject({
        code: 'DRAFT_INCOMPLETE',
        status: 400,
      });
      await expect(prisma.appointment.count()).resolves.toBe(0);
    });

    it("overrides the model when it claims confirmation but details are missing", async () => {
      const provider = new StubProvider([
        // The model says "confirmed" while the draft has no date or time.
        extraction({
          intent: 'confirm_appointment',
          reply: 'Booked!',
          appointmentType: 'Dentist',
        }),
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      const result = await service.sendMessage(user.id, sessionId, 'yes do it', 'UTC');

      expect(result.appointment).toBeNull();
      expect(result.missingFields).toContain('date');
      await expect(prisma.appointment.count()).resolves.toBe(0);
    });
  });

  describe('an ambiguous request', () => {
    it('does not invent a time for "book me whenever"', async () => {
      const provider = new StubProvider([
        extraction({
          intent: 'unclear',
          reply: 'Happy to book that — which day and time suit you?',
          missingFields: ['appointmentType', 'date', 'startTime'],
          needsClarification: true,
        }),
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      const result = await service.sendMessage(user.id, sessionId, 'Book me whenever', 'UTC');

      expect(result.draft.date).toBeNull();
      expect(result.draft.startTime).toBeNull();
      expect(result.readyToConfirm).toBe(false);
      // An unclear turn routes the user toward the form.
      expect(result.suggestManual).toBe(true);
    });
  });

  describe('malformed model output', () => {
    it('retries once, then succeeds', async () => {
      const date = futureDate(1);
      const provider = new StubProvider([
        'I think you want a dentist appointment!',
        extraction({ appointmentType: 'Dentist', date, startTime: '15:00', durationMinutes: 30 }),
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      const result = await service.sendMessage(user.id, sessionId, 'Dentist tomorrow 3pm', 'UTC');

      expect(provider.calls).toHaveLength(2);
      expect(result.readyToConfirm).toBe(true);
    });

    it('recovers from JSON wrapped in a code fence', async () => {
      const date = futureDate(1);
      const provider = new StubProvider([
        '```json\n' +
          extraction({ appointmentType: 'Dentist', date, startTime: '15:00', durationMinutes: 30 }) +
          '\n```',
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      const result = await service.sendMessage(user.id, sessionId, 'Dentist tomorrow 3pm', 'UTC');
      expect(result.readyToConfirm).toBe(true);
    });

    it('falls back to the manual form after two malformed responses', async () => {
      const provider = new StubProvider(['not json', 'still not json']);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      const result = await service.sendMessage(user.id, sessionId, 'Dentist tomorrow', 'UTC');

      expect(result.suggestManual).toBe(true);
      expect(result.appointment).toBeNull();
      expect(result.message.content.toLowerCase()).toContain('manual form');
    });

    it('ignores a hallucinated field the schema does not allow', async () => {
      const provider = new StubProvider([
        JSON.stringify({
          intent: 'book_appointment',
          reply: 'Got it.',
          appointment: {
            appointmentType: 'Dentist',
            date: 'next tuesday', // not a real date — must not be accepted
            startTime: '15:00',
            durationMinutes: 30,
            notes: null,
          },
          missingFields: [],
          needsClarification: false,
        }),
        extraction({ appointmentType: 'Dentist', startTime: '15:00', durationMinutes: 30 }),
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      const result = await service.sendMessage(user.id, sessionId, 'Dentist next tuesday 3pm', 'UTC');

      expect(result.draft.date).toBeNull();
      expect(result.missingFields).toContain('date');
    });
  });

  describe('provider failure', () => {
    it('keeps the conversation usable and points at the manual form', async () => {
      const service = chatWith(unavailableProvider());
      const sessionId = await startSession(service);

      const result = await service.sendMessage(user.id, sessionId, 'Dentist tomorrow at 3pm', 'UTC');

      expect(result.aiAvailable).toBe(false);
      expect(result.suggestManual).toBe(true);
      expect(result.message.content).toContain('temporarily unavailable');
      expect(result.appointment).toBeNull();
    });

    it('records the failure for debugging without storing message content', async () => {
      const service = chatWith(unavailableProvider());
      const sessionId = await startSession(service);

      await service.sendMessage(user.id, sessionId, 'Dentist tomorrow at 3pm', 'UTC');

      const interaction = await prisma.aiInteraction.findFirst();
      expect(interaction).toMatchObject({ success: false, errorCode: 'AI_UNAVAILABLE' });

      const serialised = JSON.stringify(interaction);
      expect(serialised).not.toContain('Dentist tomorrow at 3pm');
    });
  });

  describe('prompt context', () => {
    it('injects the current date and the running draft into the system prompt', async () => {
      const date = futureDate(1);
      const provider = new StubProvider([
        extraction({ appointmentType: 'Dentist', date, missingFields: ['startTime'] }),
        extraction({ startTime: '15:00' }),
      ]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      await service.sendMessage(user.id, sessionId, 'Dentist tomorrow', 'UTC');
      await service.sendMessage(user.id, sessionId, '3pm', 'UTC');

      const secondSystemPrompt = provider.calls[1]?.messages[0]?.content ?? '';
      expect(secondSystemPrompt).toContain('Today is');
      // The draft from turn one is carried into turn two's prompt.
      expect(secondSystemPrompt).toContain('appointmentType: Dentist');
      expect(secondSystemPrompt).toContain(`date: ${date}`);
    });

    it('asks the provider for JSON output', async () => {
      const provider = new StubProvider([extraction({ appointmentType: 'Dentist' })]);
      const service = chatWith(provider);
      const sessionId = await startSession(service);

      await service.sendMessage(user.id, sessionId, 'Dentist', 'UTC');
      expect(provider.calls[0]?.jsonMode).toBe(true);
    });
  });

  describe('appointment rules still apply to AI bookings', () => {
    it('rejects a confirmed draft that collides with an existing appointment', async () => {
      const date = futureDate(3);
      const service = chatWith(
        new StubProvider([
          extraction({ appointmentType: 'Dentist', date, startTime: '15:00', durationMinutes: 30 }),
        ]),
      );

      await prisma.appointment.create({
        data: {
          userId: user.id,
          appointmentType: 'Existing',
          startsAt: new Date(`${date}T15:00:00.000Z`),
          endsAt: new Date(`${date}T16:00:00.000Z`),
          durationMinutes: 60,
          timezone: 'UTC',
        },
      });

      const sessionId = await startSession(service);
      await service.sendMessage(user.id, sessionId, 'Dentist at 3pm', 'UTC');

      await expect(service.confirmDraft(user.id, sessionId)).rejects.toMatchObject({
        code: 'APPOINTMENT_CONFLICT',
      });
    });

    it('rejects a confirmed draft that is in the past', async () => {
      const service = chatWith(
        new StubProvider([
          extraction({
            appointmentType: 'Dentist',
            date: '2020-01-01',
            startTime: '15:00',
            durationMinutes: 30,
          }),
        ]),
      );

      const sessionId = await startSession(service);
      await service.sendMessage(user.id, sessionId, 'Dentist', 'UTC');

      await expect(service.confirmDraft(user.id, sessionId)).rejects.toMatchObject({ status: 400 });
    });
  });
});
