import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createTestUser,
  futureDate,
  resetDatabase,
  validAppointmentPayload,
  type TestUser,
} from '../helpers/testApp';
import { prisma } from '../../src/db/prisma';

describe('appointments', () => {
  let user: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    user = await createTestUser();
  });

  afterAll(() => prisma.$disconnect());

  async function createAppointment(overrides: Record<string, unknown> = {}) {
    const response = await api()
      .post('/api/appointments')
      .set('Cookie', user.cookie)
      .send(validAppointmentPayload(overrides));
    return response;
  }

  describe('POST /api/appointments', () => {
    it('creates an appointment and derives the end time from the duration', async () => {
      const response = await createAppointment({ startTime: '15:00', durationMinutes: 45 });

      expect(response.status).toBe(201);
      expect(response.body.data.appointment).toMatchObject({
        appointmentType: 'Dentist',
        startTime: '15:00',
        endTime: '15:45',
        durationMinutes: 45,
        status: 'CONFIRMED',
        source: 'MANUAL',
      });
    });

    it('stores the correct UTC instant for a non-UTC timezone', async () => {
      // 15:00 in Karachi (UTC+5, no DST) is 10:00Z.
      const response = await createAppointment({
        timezone: 'Asia/Karachi',
        startTime: '15:00',
        date: futureDate(5),
      });

      expect(response.status).toBe(201);
      const { startsAt, startTime } = response.body.data.appointment;
      expect(new Date(startsAt).toISOString()).toContain('T10:00:00');
      // The local wall-clock time is preserved for display.
      expect(startTime).toBe('15:00');
    });

    it('rejects a booking in the past', async () => {
      const response = await createAppointment({ date: '2020-01-01' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['duration below the minimum', { durationMinutes: 5 }],
      ['duration off the 5-minute grid', { durationMinutes: 37 }],
      ['malformed time', { startTime: '25:00' }],
      ['malformed date', { date: '2026-02-30' }],
      ['empty type', { appointmentType: '' }],
      ['unknown timezone', { timezone: 'Mars/Olympus' }],
    ])('rejects %s', async (_label, overrides) => {
      const response = await createAppointment(overrides);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an overlapping appointment with 409', async () => {
      await createAppointment({ startTime: '15:00', durationMinutes: 60 });
      const overlapping = await createAppointment({ startTime: '15:30', durationMinutes: 30 });

      expect(overlapping.status).toBe(409);
      expect(overlapping.body.error.code).toBe('APPOINTMENT_CONFLICT');
    });

    it('allows a back-to-back appointment that starts exactly when the previous ends', async () => {
      await createAppointment({ startTime: '15:00', durationMinutes: 30 });
      const adjacent = await createAppointment({ startTime: '15:30', durationMinutes: 30 });

      expect(adjacent.status).toBe(201);
    });

    it('allows two users to hold the same slot', async () => {
      const other = await createTestUser();
      await createAppointment({ startTime: '15:00' });

      const response = await api()
        .post('/api/appointments')
        .set('Cookie', other.cookie)
        .send(validAppointmentPayload({ startTime: '15:00' }));

      expect(response.status).toBe(201);
    });

    it('strips unknown fields instead of passing them to the database', async () => {
      const response = await api()
        .post('/api/appointments')
        .set('Cookie', user.cookie)
        .send({ ...validAppointmentPayload(), status: 'COMPLETED', userId: 'someone-else' });

      expect(response.status).toBe(201);
      expect(response.body.data.appointment.status).toBe('CONFIRMED');

      const stored = await prisma.appointment.findFirst();
      expect(stored?.userId).toBe(user.id);
    });
  });

  describe('GET /api/appointments', () => {
    it('returns only the caller’s appointments', async () => {
      const other = await createTestUser();
      await createAppointment({ appointmentType: 'Mine' });
      await api()
        .post('/api/appointments')
        .set('Cookie', other.cookie)
        .send(validAppointmentPayload({ appointmentType: 'Theirs' }));

      const response = await api().get('/api/appointments').set('Cookie', user.cookie).expect(200);

      expect(response.body.data.appointments).toHaveLength(1);
      expect(response.body.data.appointments[0].appointmentType).toBe('Mine');
      expect(response.body.data.pagination.total).toBe(1);
    });

    it('filters by status', async () => {
      const created = await createAppointment();
      await api()
        .patch(`/api/appointments/${created.body.data.appointment.id}`)
        .set('Cookie', user.cookie)
        .send({ status: 'CANCELLED' })
        .expect(200);

      const cancelled = await api()
        .get('/api/appointments?status=CANCELLED')
        .set('Cookie', user.cookie)
        .expect(200);
      const confirmed = await api()
        .get('/api/appointments?status=CONFIRMED')
        .set('Cookie', user.cookie)
        .expect(200);

      expect(cancelled.body.data.appointments).toHaveLength(1);
      expect(confirmed.body.data.appointments).toHaveLength(0);
    });

    it('rejects an invalid query parameter', async () => {
      const response = await api()
        .get('/api/appointments?status=NOT_A_STATUS')
        .set('Cookie', user.cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/appointments/:id', () => {
    it('reschedules and recomputes the end time', async () => {
      const created = await createAppointment();
      const id = created.body.data.appointment.id;

      const response = await api()
        .patch(`/api/appointments/${id}`)
        .set('Cookie', user.cookie)
        .send({ date: futureDate(4), startTime: '09:00', durationMinutes: 60 })
        .expect(200);

      expect(response.body.data.appointment).toMatchObject({
        startTime: '09:00',
        endTime: '10:00',
        durationMinutes: 60,
      });
    });

    it('rejects a reschedule that would collide with another appointment', async () => {
      await createAppointment({ startTime: '09:00', durationMinutes: 60 });
      const second = await createAppointment({ startTime: '15:00', durationMinutes: 30 });

      const response = await api()
        .patch(`/api/appointments/${second.body.data.appointment.id}`)
        .set('Cookie', user.cookie)
        .send({ date: validAppointmentPayload().date, startTime: '09:30' })
        .expect(409);

      expect(response.body.error.code).toBe('APPOINTMENT_CONFLICT');
    });

    it('does not treat an appointment as colliding with itself', async () => {
      const created = await createAppointment({ startTime: '15:00', durationMinutes: 30 });

      await api()
        .patch(`/api/appointments/${created.body.data.appointment.id}`)
        .set('Cookie', user.cookie)
        .send({ appointmentType: 'Dentist checkup' })
        .expect(200);
    });

    it('rejects a date change without a matching time change', async () => {
      const created = await createAppointment();

      const response = await api()
        .patch(`/api/appointments/${created.body.data.appointment.id}`)
        .set('Cookie', user.cookie)
        .send({ date: futureDate(6) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an empty update', async () => {
      const created = await createAppointment();

      await api()
        .patch(`/api/appointments/${created.body.data.appointment.id}`)
        .set('Cookie', user.cookie)
        .send({})
        .expect(400);
    });
  });

  describe('DELETE /api/appointments/:id', () => {
    it('deletes the appointment', async () => {
      const created = await createAppointment();
      const id = created.body.data.appointment.id;

      await api().delete(`/api/appointments/${id}`).set('Cookie', user.cookie).expect(204);
      await api().get(`/api/appointments/${id}`).set('Cookie', user.cookie).expect(404);
    });
  });

  describe('input handling', () => {
    it('rejects a non-uuid id with 400 rather than reaching the database', async () => {
      const response = await api()
        .get('/api/appointments/not-a-uuid')
        .set('Cookie', user.cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('treats a SQL injection attempt as ordinary text', async () => {
      const injection = "Dentist'; DROP TABLE appointments; --";
      const response = await createAppointment({ appointmentType: injection });

      expect(response.status).toBe(201);
      expect(response.body.data.appointment.appointmentType).toBe(injection);
      // The table is still there, and the value was stored verbatim.
      await expect(prisma.appointment.count()).resolves.toBe(1);
    });
  });
});
