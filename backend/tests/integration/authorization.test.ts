import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createTestUser,
  resetDatabase,
  validAppointmentPayload,
  type TestUser,
} from '../helpers/testApp';
import { prisma } from '../../src/db/prisma';

/**
 * Authorization boundaries.
 *
 * The threat model is the simplest and most common one: an authenticated user
 * swapping an id in a URL for somebody else's. Every protected resource is
 * checked from both sides — the owner can reach it, the other user cannot.
 */
describe('authorization boundaries', () => {
  let owner: TestUser;
  let intruder: TestUser;
  let appointmentId: string;
  let sessionId: string;

  beforeEach(async () => {
    await resetDatabase();
    owner = await createTestUser();
    intruder = await createTestUser();

    const appointment = await api()
      .post('/api/appointments')
      .set('Cookie', owner.cookie)
      .send(validAppointmentPayload())
      .expect(201);
    appointmentId = appointment.body.data.appointment.id;

    const session = await api()
      .post('/api/chat/sessions')
      .set('Cookie', owner.cookie)
      .send({ timezone: 'UTC' })
      .expect(201);
    sessionId = session.body.data.session.id;
  });

  afterAll(() => prisma.$disconnect());

  it('lets the owner read their own appointment', async () => {
    const response = await api()
      .get(`/api/appointments/${appointmentId}`)
      .set('Cookie', owner.cookie)
      .expect(200);

    expect(response.body.data.appointment.id).toBe(appointmentId);
  });

  it("hides another user's appointment behind a 404, not a 403", async () => {
    // 404 rather than 403 so the response cannot confirm that the id exists.
    const response = await api()
      .get(`/api/appointments/${appointmentId}`)
      .set('Cookie', intruder.cookie)
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it("refuses to update another user's appointment, and leaves it unchanged", async () => {
    await api()
      .patch(`/api/appointments/${appointmentId}`)
      .set('Cookie', intruder.cookie)
      .send({ appointmentType: 'Hijacked' })
      .expect(404);

    const stored = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(stored?.appointmentType).toBe('Dentist');
  });

  it("refuses to delete another user's appointment", async () => {
    await api()
      .delete(`/api/appointments/${appointmentId}`)
      .set('Cookie', intruder.cookie)
      .expect(404);

    await expect(prisma.appointment.count()).resolves.toBe(1);
  });

  it("refuses to read another user's chat session", async () => {
    await api().get(`/api/chat/sessions/${sessionId}`).set('Cookie', owner.cookie).expect(200);
    await api().get(`/api/chat/sessions/${sessionId}`).set('Cookie', intruder.cookie).expect(404);
  });

  it("refuses to post into another user's chat session", async () => {
    await api()
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Cookie', intruder.cookie)
      .send({ content: 'Book me a dentist appointment' })
      .expect(404);

    // Nothing was written to the session the intruder targeted.
    const messages = await prisma.chatMessage.count({ where: { sessionId, role: 'USER' } });
    expect(messages).toBe(0);
  });

  it("refuses to confirm a draft on another user's session", async () => {
    await api()
      .post(`/api/chat/sessions/${sessionId}/confirm`)
      .set('Cookie', intruder.cookie)
      .send({})
      .expect(404);
  });

  it.each([
    ['GET', '/api/appointments'],
    ['POST', '/api/appointments'],
    ['GET', '/api/chat/sessions'],
    ['POST', '/api/chat/sessions'],
    ['GET', '/api/auth/me'],
  ])('requires authentication for %s %s', async (method, path) => {
    const client = api();
    const verb = method.toLowerCase() as 'get' | 'post';
    const response = await client[verb](path).send({});

    expect(response.status).toBe(401);
  });
});
