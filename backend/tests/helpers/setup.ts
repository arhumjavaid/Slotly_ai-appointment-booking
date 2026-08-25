import path from 'node:path';
import dotenv from 'dotenv';

// Loaded before any application module so `config/env` sees the test values.
// TEST_DATABASE_URL wins when present, which is how CI points the suite at a
// disposable database without touching the developer's .env.
dotenv.config({ path: path.resolve(__dirname, '../../.env.test'), override: true });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
