import { PrismaClient } from '@prisma/client';
import { env, isProduction } from '../config/env';
import { logger } from '../config/logger';

/**
 * Single Prisma client for the process.
 *
 * Cached on globalThis so `tsx watch` hot reloads do not open a new connection
 * pool on every file change (a classic dev-time connection exhaustion bug).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['error', 'warn'],
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info({ env: env.NODE_ENV }, 'Database connection established');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
