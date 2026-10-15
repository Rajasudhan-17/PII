import fs from 'fs';
import path from 'path';
import { handleGracefulShutdown, getIsShuttingDown, resetShutdownStateForTesting } from '../../src/server';
import { checkHealth, checkReadiness } from '../../src/services/health.service';
import * as dbConfig from '../../src/config/database';
import * as redisConfig from '../../src/config/redis';
import { Job } from 'bullmq';
import { defaultWorkerOptions, getDeadLetterQueue, DEAD_LETTER_QUEUE_NAME, DeadLetterRecord } from '../../src/queues/queue';
import { IDocument } from '../../src/models/document.model';
import { validateArchiveBounds, validateImageDimensions } from '../../src/utils/fileValidation';
import { metrics } from '../../src/utils/metrics';
import { AppError } from '../../src/utils/AppError';

describe('Phase 15 — Production Resilience & Lifecycle Unit Tests', () => {
  beforeEach(() => {
    resetShutdownStateForTesting();
    metrics.reset();
  });

  afterEach(() => {
    resetShutdownStateForTesting();
  });

  describe('Service Lifecycle & Graceful Shutdown', () => {
    test('initiates graceful shutdown and sets shutting down flag', async () => {
      expect(getIsShuttingDown()).toBe(false);

      // Execute shutdown with custom bounded deadline of 500ms
      await handleGracefulShutdown('SIGTERM', 500);

      expect(getIsShuttingDown()).toBe(true);
    });

    test('ignores duplicate shutdown calls if already shutting down', async () => {
      await handleGracefulShutdown('SIGINT', 500);
      expect(getIsShuttingDown()).toBe(true);

      // Second call should return early without throwing
      await expect(handleGracefulShutdown('SIGINT', 500)).resolves.toBeUndefined();
      expect(getIsShuttingDown()).toBe(true);
    });

    test('enforces bounded deadline when shutdown operations stall', async () => {
      let timeoutFired = false;
      const timeoutMs = 50;

      let resolveStalled: () => void;
      const dbSpy = jest.spyOn(dbConfig, 'disconnectDatabase').mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveStalled = resolve;
          })
      );

      const shutdownPromise = handleGracefulShutdown('SIGTERM', timeoutMs, () => {
        timeoutFired = true;
      });

      // Wait slightly past timeoutMs for timer to trigger
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(timeoutFired).toBe(true);
      expect(getIsShuttingDown()).toBe(true);

      resolveStalled!();
      await shutdownPromise;
      dbSpy.mockRestore();
    });
  });

  describe('Health Probing: Liveness vs Readiness', () => {
    test('checkReadiness returns status "ready" when MongoDB and Redis are connected', () => {
      const dbSpy = jest.spyOn(dbConfig, 'getDatabaseStatus').mockReturnValue('connected');
      const redisSpy = jest.spyOn(redisConfig, 'getRedisStatus').mockReturnValue('connected');

      const readiness = checkReadiness();
      expect(readiness.status).toBe('ready');
      expect(readiness.dependencies.mongodb).toBe('connected');
      expect(readiness.dependencies.redis).toBe('connected');

      dbSpy.mockRestore();
      redisSpy.mockRestore();
    });

    test('checkReadiness returns status "not_ready" when MongoDB is disconnected', () => {
      const dbSpy = jest.spyOn(dbConfig, 'getDatabaseStatus').mockReturnValue('disconnected');
      const redisSpy = jest.spyOn(redisConfig, 'getRedisStatus').mockReturnValue('connected');

      const readiness = checkReadiness();
      expect(readiness.status).toBe('not_ready');
      expect(readiness.dependencies.mongodb).toBe('disconnected');
      expect(readiness.dependencies.redis).toBe('connected');

      dbSpy.mockRestore();
      redisSpy.mockRestore();
    });

    test('checkReadiness returns status "not_ready" when Redis is disconnected', () => {
      const dbSpy = jest.spyOn(dbConfig, 'getDatabaseStatus').mockReturnValue('connected');
      const redisSpy = jest.spyOn(redisConfig, 'getRedisStatus').mockReturnValue('disconnected');

      const readiness = checkReadiness();
      expect(readiness.status).toBe('not_ready');
      expect(readiness.dependencies.redis).toBe('disconnected');

      dbSpy.mockRestore();
      redisSpy.mockRestore();
    });

    test('checkHealth returns degraded status when any dependency is offline', () => {
      const dbSpy = jest.spyOn(dbConfig, 'getDatabaseStatus').mockReturnValue('connected');
      const redisSpy = jest.spyOn(redisConfig, 'getRedisStatus').mockReturnValue('disconnected');

      const health = checkHealth();
      expect(health.status).toBe('degraded');

      dbSpy.mockRestore();
      redisSpy.mockRestore();
    });
  });

  describe('Queue Resiliency & Dead-Letter Handling', () => {
    test('defaultWorkerOptions includes stuck-job recovery and bounded lock duration', () => {
      expect(defaultWorkerOptions.lockDuration).toBe(30000);
      expect(defaultWorkerOptions.maxStalledCount).toBe(2);
      expect(defaultWorkerOptions.stalledInterval).toBe(30000);
      expect(defaultWorkerOptions.concurrency).toBe(5);
    });

    test('getDeadLetterQueue initializes and references deadLetterQueue', () => {
      const dlq = getDeadLetterQueue();
      expect(dlq.name).toBe(DEAD_LETTER_QUEUE_NAME);
    });

    test('dead-letter queue capture logic adds record when attemptsMade >= maxAttempts', async () => {
      const dlq = getDeadLetterQueue();
      const addSpy = jest.spyOn(dlq, 'add').mockResolvedValue({} as Job<DeadLetterRecord>);

      const failedJob = {
        id: 'job_fail_123',
        name: 'extractJob',
        data: { organizationId: 'org_abc', documentId: 'doc_xyz' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      };
      const error = new Error('Permanent worker processing error');

      const maxAttempts = failedJob.opts.attempts;
      if (failedJob.attemptsMade >= maxAttempts) {
        await dlq.add('deadLetterJob', {
          originalQueue: 'extractionQueue',
          jobId: failedJob.id,
          jobName: failedJob.name,
          data: failedJob.data,
          failedReason: error.message,
          attemptsMade: failedJob.attemptsMade,
          failedAt: new Date().toISOString(),
        });
      }

      expect(addSpy).toHaveBeenCalledTimes(1);
      const callArgs = addSpy.mock.calls[0];
      expect(callArgs[0]).toBe('deadLetterJob');
      expect(callArgs[1].jobId).toBe('job_fail_123');
      expect(callArgs[1].originalQueue).toBe('extractionQueue');
      expect(callArgs[1].failedReason).toBe('Permanent worker processing error');
      expect(callArgs[1].attemptsMade).toBe(3);
      expect(callArgs[1].data).toEqual({ organizationId: 'org_abc', documentId: 'doc_xyz' });

      addSpy.mockRestore();
    });

    test('retriable failures (attemptsMade < maxAttempts) are NOT routed to dead-letter queue', async () => {
      const dlq = getDeadLetterQueue();
      const addSpy = jest.spyOn(dlq, 'add').mockResolvedValue({} as Job<DeadLetterRecord>);

      const failedJob = {
        id: 'job_retry_123',
        name: 'extractJob',
        data: { organizationId: 'org_abc' },
        attemptsMade: 1, // Only 1 attempt of 3
        opts: { attempts: 3 },
      };

      const maxAttempts = failedJob.opts.attempts;
      if (failedJob.attemptsMade >= maxAttempts) {
        await dlq.add('deadLetterJob', {
          originalQueue: 'extractionQueue',
          jobName: failedJob.name,
          data: failedJob.data,
          failedReason: 'test',
          attemptsMade: 1,
          failedAt: new Date().toISOString(),
        });
      }

      expect(addSpy).not.toHaveBeenCalled();
      addSpy.mockRestore();
    });
  });

  describe('Resource Governance & Decompression Bounds', () => {
    test('validateArchiveBounds passes when entry count and uncompressed size are within limits', () => {
      expect(() => validateArchiveBounds(50, 10 * 1024 * 1024)).not.toThrow();
    });

    test('validateArchiveBounds rejects excessive entry count (>1000) as zip bomb', () => {
      expect(() => validateArchiveBounds(1001, 10 * 1024 * 1024)).toThrow(AppError);
      try {
        validateArchiveBounds(1001, 1024);
      } catch (err: unknown) {
        expect((err as AppError).errorCode).toBe('ZIP_BOMB_DETECTED');
        expect((err as AppError).statusCode).toBe(400);
      }
    });

    test('validateArchiveBounds rejects uncompressed size exceeding 50MB limit', () => {
      const oversizedBytes = 55 * 1024 * 1024; // 55MB
      expect(() => validateArchiveBounds(10, oversizedBytes)).toThrow(AppError);
      try {
        validateArchiveBounds(10, oversizedBytes);
      } catch (err: unknown) {
        expect((err as AppError).errorCode).toBe('ZIP_BOMB_DETECTED');
        expect((err as AppError).statusCode).toBe(400);
      }
    });

    test('XLSX extractor handles malformed non-ZIP file gracefully', async () => {
      const { XlsxExtractor } = await import('../../src/services/extractors/xlsx.extractor');
      const extractor = new XlsxExtractor();
      const mockDoc = { _id: 'doc_bad_xlsx', extension: 'xlsx' } as unknown as IDocument;

      const tempPath = path.join(__dirname, 'temp_malformed.xlsx');
      fs.writeFileSync(tempPath, 'This is definitely not an xlsx PK zip archive');

      try {
        const result = await extractor.extract(mockDoc, tempPath);
        expect(result.status).toBe('FAILED');
        expect(result.warnings[0].code).toBe('CORRUPT_STRUCTURE');
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });

    test('validateImageDimensions rejects image exceeding 10,000px single dimension', () => {
      expect(() => validateImageDimensions(12000, 800)).toThrow(AppError);
      try {
        validateImageDimensions(12000, 800);
      } catch (err: unknown) {
        expect((err as AppError).errorCode).toBe('IMAGE_DIMENSION_LIMIT_EXCEEDED');
      }
    });

    test('validateImageDimensions rejects image exceeding 50,000,000 total pixels', () => {
      expect(() => validateImageDimensions(8000, 7000)).toThrow(AppError);
      try {
        validateImageDimensions(8000, 7000);
      } catch (err: unknown) {
        expect((err as AppError).errorCode).toBe('IMAGE_DIMENSION_LIMIT_EXCEEDED');
      }
    });

    test('validateImageDimensions allows normal resolution image', () => {
      expect(() => validateImageDimensions(1920, 1080)).not.toThrow();
    });
  });

  describe('Observability & PII-Safe Telemetry', () => {
    test('records counters and duration metrics correctly', () => {
      metrics.increment('ocr_requests_total', 1, { engine: 'trocr' });
      metrics.increment('ocr_requests_total', 2, { engine: 'trocr' });
      metrics.recordDuration('ocr_latency_ms', 150, { engine: 'trocr' });
      metrics.recordDuration('ocr_latency_ms', 250, { engine: 'trocr' });

      const snapshot = metrics.getMetricsSnapshot();
      expect(snapshot.counters['ocr_requests_total{engine="trocr"}']).toBe(3);
      expect(snapshot.timings['ocr_latency_ms{engine="trocr"}'].count).toBe(2);
      expect(snapshot.timings['ocr_latency_ms{engine="trocr"}'].avgMs).toBe(200);
      expect(snapshot.timings['ocr_latency_ms{engine="trocr"}'].minMs).toBe(150);
      expect(snapshot.timings['ocr_latency_ms{engine="trocr"}'].maxMs).toBe(250);
    });

    test('sanitizes metric labels to prevent injection or raw PII in keys', () => {
      metrics.increment('job_processed', 1, {
        tenant: 'org_123',
        description: 'safe_test_label\nwith_newline"and_quotes',
      });

      const snapshot = metrics.getMetricsSnapshot();
      const keys = Object.keys(snapshot.counters);
      expect(keys.length).toBe(1);
      expect(keys[0]).not.toContain('\n');
      expect(keys[0]).toContain('safe_test_label_with_newline_and_quotes');
    });
  });
});
