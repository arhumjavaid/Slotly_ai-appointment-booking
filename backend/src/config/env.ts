import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from the backend package root regardless of cwd.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_NAME: z.string().default('appointment_ai_token'),
  COOKIE_DOMAIN: z.string().optional(),
  // Cross-site deployments (frontend and API on different registrable domains)
  // require SameSite=None + Secure. Same-site local dev works with Lax.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // One or more comma-separated origins allowed to call this API from a browser.
  FRONTEND_URL: z
    .string()
    .default('http://localhost:3000')
    .refine(
      (value) => value.split(',').every((origin) => /^https?:\/\/[^\s,]+$/.test(origin.trim())),
      'FRONTEND_URL must be a comma-separated list of http(s) origins',
    ),

  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_MODEL: z.string().default('mistral-small-latest'),
  MISTRAL_BASE_URL: z.string().url().default('https://api.mistral.ai/v1'),
  MISTRAL_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DEFAULT_TIMEZONE: z.string().default('UTC'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loudly, but never print the offending values themselves.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Allowed browser origins for CORS. Comma-separated FRONTEND_URL is supported. */
export const allowedOrigins = env.FRONTEND_URL.split(',').map((o) => o.trim()).filter(Boolean);
