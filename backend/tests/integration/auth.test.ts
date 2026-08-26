import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, createTestUser, resetDatabase, validAppointmentPayload } from '../helpers/testApp';
import { prisma } from '../../src/db/prisma';

describe('authentication', () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  const validPayload = {
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    password: 'Passw0rdTest',
  };

  describe('POST /api/auth/register', () => {
    it('creates an account and sets an HttpOnly session cookie', async () => {
      const response = await api().post('/api/auth/register').send(validPayload).expect(201);

      expect(response.body.data.user).toMatchObject({
        name: 'Ada Lovelace',
        email: 'ada@example.test',
      });

      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies[0]).toContain('HttpOnly');
      expect(cookies[0]).toContain('SameSite=Lax');
    });

    it('never returns the password hash or a token in the body', async () => {
      const response = await api().post('/api/auth/register').send(validPayload).expect(201);

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toContain('passwordHash');
      expect(serialised).not.toContain(validPayload.password);
      expect(response.body.data).not.toHaveProperty('token');
    });

    it('stores the password as a bcrypt hash, never as plaintext', async () => {
      await api().post('/api/auth/register').send(validPayload).expect(201);

      const user = await prisma.user.findUnique({ where: { email: validPayload.email } });
      expect(user?.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(user?.passwordHash).not.toBe(validPayload.password);
    });

    it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
      await api().post('/api/auth/register').send(validPayload).expect(201);

      const response = await api().post('/api/auth/register').send(validPayload).expect(409);
      expect(response.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('treats email as case-insensitive when detecting duplicates', async () => {
      await api().post('/api/auth/register').send(validPayload).expect(201);

      await api()
        .post('/api/auth/register')
        .send({ ...validPayload, email: 'ADA@Example.TEST' })
        .expect(409);
    });

    it.each([
      ['short password', { ...validPayload, password: 'Ab1' }],
      ['no uppercase', { ...validPayload, password: 'passw0rdtest' }],
      ['no number', { ...validPayload, password: 'PasswordTest' }],
      ['invalid email', { ...validPayload, email: 'not-an-email' }],
      ['missing name', { email: 'x@example.test', password: 'Passw0rdTest' }],
    ])('rejects %s with a field-level validation error', async (_label, payload) => {
      const response = await api().post('/api/auth/register').send(payload).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await api().post('/api/auth/register').send(validPayload).expect(201);
    });

    it('signs in with correct credentials', async () => {
      const response = await api()
        .post('/api/auth/login')
        .send({ email: validPayload.email, password: validPayload.password })
        .expect(200);

      expect(response.body.data.user.email).toBe(validPayload.email);
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('rejects a wrong password with 401', async () => {
      const response = await api()
        .post('/api/auth/login')
        .send({ email: validPayload.email, password: 'WrongPassw0rd' })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('returns the same error for an unknown email, so accounts cannot be enumerated', async () => {
      const unknown = await api()
        .post('/api/auth/login')
        .send({ email: 'nobody@example.test', password: 'Passw0rdTest' })
        .expect(401);

      const wrongPassword = await api()
        .post('/api/auth/login')
        .send({ email: validPayload.email, password: 'WrongPassw0rd' })
        .expect(401);

      expect(unknown.body.error).toEqual(wrongPassword.body.error);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the signed-in user', async () => {
      const user = await createTestUser();

      const response = await api().get('/api/auth/me').set('Cookie', user.cookie).expect(200);
      expect(response.body.data.user.id).toBe(user.id);
    });

    it('rejects a request with no cookie', async () => {
      const response = await api().get('/api/auth/me').expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a tampered token', async () => {
      const user = await createTestUser();
      const tampered = `${user.cookie.split('=')[0]}=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoYWNrZXIifQ.bad`;

      await api().get('/api/auth/me').set('Cookie', tampered).expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie', async () => {
      const user = await createTestUser();
      const response = await api().post('/api/auth/logout').set('Cookie', user.cookie).expect(200);

      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies[0]).toMatch(/=;/);
    });
  });

  describe('PATCH /api/auth/me', () => {
    it('updates the profile and the booking preferences', async () => {
      const user = await createTestUser();

      const response = await api()
        .patch('/api/auth/me')
        .set('Cookie', user.cookie)
        .send({ name: 'Renamed Person', defaultDurationMinutes: 45 })
        .expect(200);

      expect(response.body.data.user.name).toBe('Renamed Person');
      expect(response.body.data.user.defaultDurationMinutes).toBe(45);
    });

    it('ignores an email sent alongside a real change', async () => {
      const user = await createTestUser();

      const response = await api()
        .patch('/api/auth/me')
        .set('Cookie', user.cookie)
        .send({ name: 'Renamed Person', email: `hijack.${Date.now()}@example.test` })
        .expect(200);

      // The schema has no `email` key, so validate() strips it before the
      // service runs. The name change lands; the address does not move.
      expect(response.body.data.user.name).toBe('Renamed Person');
      expect(response.body.data.user.email).toBe(user.email);
    });

    it('rejects a body that only tries to change the email', async () => {
      const user = await createTestUser();

      // Stripped down to {}, which the "at least one field" rule refuses —
      // so this reads as a rejection rather than a silent success.
      await api()
        .patch('/api/auth/me')
        .set('Cookie', user.cookie)
        .send({ email: `hijack.${Date.now()}@example.test` })
        .expect(400);

      const me = await api().get('/api/auth/me').set('Cookie', user.cookie).expect(200);
      expect(me.body.data.user.email).toBe(user.email);
    });

    it('cannot take over another account’s email', async () => {
      const other = await createTestUser();
      const user = await createTestUser();

      await api()
        .patch('/api/auth/me')
        .set('Cookie', user.cookie)
        .send({ name: 'Impostor', email: other.email })
        .expect(200);

      const me = await api().get('/api/auth/me').set('Cookie', user.cookie).expect(200);
      expect(me.body.data.user.email).toBe(user.email);
    });

    it('rejects an out-of-range duration', async () => {
      const user = await createTestUser();

      await api()
        .patch('/api/auth/me')
        .set('Cookie', user.cookie)
        .send({ defaultDurationMinutes: 9000 })
        .expect(400);
    });

    it('rejects an empty body rather than writing nothing', async () => {
      const user = await createTestUser();
      await api().patch('/api/auth/me').set('Cookie', user.cookie).send({}).expect(400);
    });

    it('requires a session', async () => {
      await api().patch('/api/auth/me').send({ name: 'Nobody' }).expect(401);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('changes the password and leaves the old one unusable', async () => {
      const user = await createTestUser();
      const newPassword = 'Rep1acement';

      await api()
        .post('/api/auth/change-password')
        .set('Cookie', user.cookie)
        .send({ currentPassword: user.password, newPassword })
        .expect(200);

      await api()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(401);

      await api()
        .post('/api/auth/login')
        .send({ email: user.email, password: newPassword })
        .expect(200);
    });

    it('rejects a wrong current password', async () => {
      const user = await createTestUser();

      const response = await api()
        .post('/api/auth/change-password')
        .set('Cookie', user.cookie)
        .send({ currentPassword: 'NotMyPassw0rd', newPassword: 'Rep1acement' })
        .expect(400);

      expect(response.body.error.details?.[0]?.field).toBe('currentPassword');
    });

    it('enforces the password policy on the new password', async () => {
      const user = await createTestUser();

      await api()
        .post('/api/auth/change-password')
        .set('Cookie', user.cookie)
        .send({ currentPassword: user.password, newPassword: 'weak' })
        .expect(400);
    });

    it('requires a session', async () => {
      await api()
        .post('/api/auth/change-password')
        .send({ currentPassword: 'Passw0rdTest', newPassword: 'Rep1acement' })
        .expect(401);
    });
  });

  describe('DELETE /api/auth/me', () => {
    it('deletes the account and its appointments', async () => {
      const user = await createTestUser();

      await api()
        .post('/api/appointments')
        .set('Cookie', user.cookie)
        .send(validAppointmentPayload())
        .expect(201);

      await api()
        .delete('/api/auth/me')
        .set('Cookie', user.cookie)
        .send({ password: user.password })
        .expect(200);

      // The session cookie now points at a row that is gone.
      await api().get('/api/auth/me').set('Cookie', user.cookie).expect(401);

      expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
      expect(await prisma.appointment.count({ where: { userId: user.id } })).toBe(0);
    });

    it('refuses to delete without the correct password', async () => {
      const user = await createTestUser();

      await api()
        .delete('/api/auth/me')
        .set('Cookie', user.cookie)
        .send({ password: 'NotMyPassw0rd' })
        .expect(400);

      expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
    });

    it('requires a session', async () => {
      await api().delete('/api/auth/me').send({ password: 'Passw0rdTest' }).expect(401);
    });
  });
});
