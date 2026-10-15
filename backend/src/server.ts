import http from 'http';
import { createApp } from './app';
import { validateEnv } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { closeQueuesAndWorkers } from './queues/queue';
import { initializeWorkers } from './queues/initWorkers';
import { logger } from './utils/logger';

let server: http.Server | null = null;
let isShuttingDown = false;

export const startServer = async (): Promise<http.Server> => {
  try {
    // 1. Validate environment configuration
    const config = validateEnv();

    logger.info({ event: 'startup_begin', environment: config.NODE_ENV }, 'Starting PII Platform Backend...');

    // 2. Connect MongoDB database
    await connectDatabase();

    // 3. Connect Redis instance
    await connectRedis();

    // 3b. Initialize BullMQ background workers
    initializeWorkers();

    // 4. Create Express application
    const app = createApp();

    // 5. Start HTTP server
    return new Promise((resolve) => {
      server = app.listen(config.PORT, () => {
        logger.info(
          { event: 'server_started', port: config.PORT, environment: config.NODE_ENV },
          `Server running on http://localhost:${config.PORT}`
        );
        resolve(server!);
      });
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.fatal({ event: 'startup_failed', error: errorMsg }, 'Server startup failed.');
    process.exit(1);
  }
};

export const getIsShuttingDown = (): boolean => isShuttingDown;
export const resetShutdownStateForTesting = (): void => {
  isShuttingDown = false;
  server = null;
};

export const handleGracefulShutdown = async (
  signal: string,
  customTimeoutMs?: number,
  onTimeout?: () => void
): Promise<void> => {
  if (isShuttingDown) {
    logger.warn({ event: 'shutdown_already_in_progress', signal }, 'Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  const timeoutMs = customTimeoutMs ?? (process.env.SHUTDOWN_TIMEOUT_MS ? parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) : 10000);
  logger.info({ event: 'graceful_shutdown_initiated', signal, timeoutMs }, `Received ${signal}. Initiating graceful shutdown with ${timeoutMs}ms deadline...`);

  // Bounded shutdown deadline timer to prevent process hanging indefinitely
  const shutdownTimer = setTimeout(() => {
    logger.fatal(
      { event: 'shutdown_timeout_exceeded', timeoutMs, signal },
      `Graceful shutdown exceeded ${timeoutMs}ms deadline! Forcing termination.`
    );
    if (onTimeout) {
      onTimeout();
    }
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }, timeoutMs);

  if (typeof shutdownTimer.unref === 'function') {
    shutdownTimer.unref();
  }

  try {
    // 1. Stop accepting new HTTP requests
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close((err) => {
          if (err) {
            logger.error({ event: 'http_server_close_error', error: err.message }, 'Error closing HTTP server.');
          } else {
            logger.info({ event: 'http_server_closed' }, 'HTTP server stopped accepting connections.');
          }
          resolve();
        });
      });
    }

    // 2. Close BullMQ queues & workers
    try {
      await closeQueuesAndWorkers();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'queue_shutdown_error', error: errorMsg }, 'Error closing queues.');
    }

    // 3. Disconnect Redis
    try {
      await disconnectRedis();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'redis_shutdown_error', error: errorMsg }, 'Error disconnecting Redis.');
    }

    // 4. Disconnect MongoDB
    try {
      await disconnectDatabase();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'mongodb_shutdown_error', error: errorMsg }, 'Error disconnecting MongoDB.');
    }

    clearTimeout(shutdownTimer);
    logger.info({ event: 'shutdown_complete' }, 'Graceful shutdown complete. Exiting process.');
  } catch (err: unknown) {
    clearTimeout(shutdownTimer);
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'shutdown_unhandled_error', error: errorMsg }, 'Error during graceful shutdown sequence.');
  }

  if (process.env.NODE_ENV !== 'test') {
    process.exit(0);
  }
};

// Register OS signals if not running directly under test suite
if (require.main === module) {
  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ event: 'unhandled_rejection', reason: String(reason) }, 'Unhandled Promise Rejection.');
  });

  process.on('uncaughtException', (error) => {
    if (error?.message && /Error attempting to read image|pix not read|pixRead/i.test(error.message)) {
      logger.error(
        { event: 'non_fatal_worker_exception', error: error.message },
        'Caught non-fatal image processing worker error; preserving server availability.'
      );
      return;
    }

    logger.fatal({ event: 'uncaught_exception', error: error.message }, 'Uncaught Exception!');
    handleGracefulShutdown('UNCAUGHT_EXCEPTION').then(() => process.exit(1));
  });

  startServer();
}
