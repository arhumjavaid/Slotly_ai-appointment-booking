import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import { logger } from '../config/logger';
import { isTest } from '../config/env';

/**
 * Per-request structured logging with a correlation id.
 *
 * Only method, path, status and duration are recorded — never bodies, cookies
 * or headers, which would otherwise capture passwords and JWTs.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  autoLogging: !isTest,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
