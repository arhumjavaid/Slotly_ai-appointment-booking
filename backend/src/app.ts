import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { allowedOrigins, isProduction } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimit';
import { apiRouter } from './routes';

export function createApp(): Express {
  const app = express();

  // Required for correct client IPs (and therefore rate limiting) behind the
  // single reverse proxy typical of Render/Railway/Fly deployments.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // This process serves JSON only; the browser never renders its output.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.use(
    cors({
      // An explicit allowlist rather than a reflected origin: credentials are
      // sent with every request, so a permissive CORS policy would be a CSRF
      // primitive rather than a convenience.
      origin(origin, callback) {
        // Reject by withholding the header rather than by throwing: throwing
        // surfaces as a 500 and fills production logs with "unhandled error"
        // for every stray cross-origin probe. Without the header the browser
        // blocks the response itself, which is what actually enforces CORS.
        callback(null, !origin || allowedOrigins.includes(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(globalLimiter);

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
