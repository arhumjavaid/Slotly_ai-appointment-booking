import pino from 'pino';
import { env, isProduction, isTest } from './env';

/**
 * Structured logger.
 *
 * Redaction is defence-in-depth: call sites are expected not to log secrets in
 * the first place, but any object accidentally carrying an auth header, cookie,
 * password or token field is scrubbed before it reaches a transport.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'apiKey',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});
