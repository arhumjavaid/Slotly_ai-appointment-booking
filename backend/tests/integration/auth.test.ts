import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, createTestUser, resetDatabase } from '../helpers/testApp';
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
});
