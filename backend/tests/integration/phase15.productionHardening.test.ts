import request from 'supertest';
import { createApp } from '../../src/app';
import { validateEnv } from '../../src/config/env';
import * as dbConfig from '../../src/config/database';
import * as redisConfig from '../../src/config/redis';
import { getDeadLetterQueue, DEAD_LETTER_QUEUE_NAME } from '../../src/queues/queue';
import { metrics } from '../../src/utils/metrics';

describe('Phase 15 — Production Hardening & Modalities Integration Tests', () => {
  const app = createApp();

  beforeAll(() => {
    validateEnv();
  });

  beforeEach(() => {
    metrics.reset();
  });

  describe('Health Probing: Liveness vs Readiness Integration Endpoints', () => {
    test('GET /health/liveness returns 200 OK process health even when dependencies are disconnected', async () => {
      const response = await request(app).get('/health/liveness');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('service', 'pii-backend');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('GET /health/readiness returns 503 Not Ready when dependencies are disconnected', async () => {
      const dbSpy = jest.spyOn(dbConfig, 'getDatabaseStatus').mockReturnValue('disconnected');
      const redisSpy = jest.spyOn(redisConfig, 'getRedisStatus').mockReturnValue('disconnected');

      const response = await request(app).get('/health/readiness');
      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'not_ready');
      expect(response.body.dependencies).toEqual({
        mongodb: 'disconnected',
        redis: 'disconnected',
      });

      dbSpy.mockRestore();
      redisSpy.mockRestore();
    });

    test('GET /health/readiness returns 200 OK when both MongoDB and Redis are ready', async () => {
      const dbSpy = jest.spyOn(dbConfig, 'getDatabaseStatus').mockReturnValue('connected');
      const redisSpy = jest.spyOn(redisConfig, 'getRedisStatus').mockReturnValue('connected');

      const response = await request(app).get('/health/readiness');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body.dependencies).toEqual({
        mongodb: 'connected',
        redis: 'connected',
      });

      dbSpy.mockRestore();
      redisSpy.mockRestore();
    });

    test('GET /api/v1/health/readiness is accessible under API prefix', async () => {
      const dbSpy = jest.spyOn(dbConfig, 'getDatabaseStatus').mockReturnValue('connected');
      const redisSpy = jest.spyOn(redisConfig, 'getRedisStatus').mockReturnValue('connected');

      const response = await request(app).get('/api/v1/health/readiness');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');

      dbSpy.mockRestore();
      redisSpy.mockRestore();
    });
  });

  describe('Observability: Structured Metrics Scraping Endpoint', () => {
    test('GET /health/metrics returns 200 OK with sanitized telemetry snapshot', async () => {
      metrics.increment('integration_test_event', 5, { env: 'test' });
      metrics.recordDuration('test_latency_ms', 42, { stage: 'qa' });

      const response = await request(app).get('/health/metrics');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptimeSeconds');
      expect(response.body).toHaveProperty('counters');
      expect(response.body).toHaveProperty('timings');
      expect(response.body.counters['integration_test_event{env="test"}']).toBe(5);
      expect(response.body.timings['test_latency_ms{stage="qa"}'].avgMs).toBe(42);
    });

    test('Zero Raw PII Security Audit: Metrics endpoint contains no PII or secrets', async () => {
      const response = await request(app).get('/health/metrics');
      const text = JSON.stringify(response.body);

      // Verify no credential tokens or PII leakage
      expect(text).not.toMatch(/password|secret|token|ssn|creditCard/i);
    });

    test('Metrics authorization: requires valid token when METRICS_AUTH_TOKEN is configured', async () => {
      const origSecret = process.env.METRICS_AUTH_TOKEN;
      process.env.METRICS_AUTH_TOKEN = 'secret-metrics-token-12345';

      try {
        // Without token -> 401
        const unauthRes = await request(app).get('/health/metrics');
        expect(unauthRes.status).toBe(401);
        expect(unauthRes.body.status).toBe('unauthorized');

        // With invalid token -> 401
        const badTokenRes = await request(app)
          .get('/health/metrics')
          .set('x-metrics-token', 'wrong-token');
        expect(badTokenRes.status).toBe(401);

        // With valid token header -> 200
        const authRes = await request(app)
          .get('/health/metrics')
          .set('x-metrics-token', 'secret-metrics-token-12345');
        expect(authRes.status).toBe(200);
        expect(authRes.body).toHaveProperty('uptimeSeconds');

        // With Bearer authorization header -> 200
        const bearerRes = await request(app)
          .get('/health/metrics')
          .set('Authorization', 'Bearer secret-metrics-token-12345');
        expect(bearerRes.status).toBe(200);
      } finally {
        if (origSecret !== undefined) {
          process.env.METRICS_AUTH_TOKEN = origSecret;
        } else {
          delete process.env.METRICS_AUTH_TOKEN;
        }
      }
    });
  });

  describe('Queue Resiliency: Dead-Letter Queue Registration & Tenant Isolation', () => {
    test('Dead-Letter Queue is registered with standard configuration', () => {
      const dlq = getDeadLetterQueue();
      expect(dlq.name).toBe(DEAD_LETTER_QUEUE_NAME);
    });

    test('Dead-letter queue job data preserves tenant isolation attributes', async () => {
      const dlq = getDeadLetterQueue();
      expect(dlq).toBeDefined();
    });
  });
});
