import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './db/prisma';
import { aiService } from './services/ai/ai.service';

async function main(): Promise<void> {
  await connectDatabase();

  if (!aiService.isAvailable) {
    logger.warn(
      'MISTRAL_API_KEY is not set — AI booking will report as unavailable and users will be routed to the manual form',
    );
  }

  const server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API server listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
    // Do not let a hung connection block the deploy's restart budget.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
