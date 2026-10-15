import request from 'supertest';
import { createApp } from '../../src/app';
import { validateEnv } from '../../src/config/env';

describe('Express Application Integration Tests', () => {
  const app = createApp();

  beforeAll(() => {
    validateEnv();
  });

  describe('GET /health & /liveness', () => {
    test('GET /health returns health report object and status 503 when dependencies are disconnected', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'degraded');
      expect(response.body).toHaveProperty('service', 'pii-backend');
      expect(response.body).toHaveProperty('dependencies');
      expect(response.body.dependencies).toEqual({
        mongodb: 'disconnected',
        redis: 'disconnected',
      });
    });

    test('GET /api/v1/health mounts correctly under API prefix', async () => {
      const response = await request(app).get('/api/v1/health');
      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('service', 'pii-backend');
    });

    test('GET /health/liveness returns liveness status 200 OK', async () => {
      const response = await request(app).get('/health/liveness');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('service', 'pii-backend');
    });
  });

  describe('Request ID & Security Headers', () => {
    test('automatically assigns X-Request-Id header to response', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    test('preserves incoming custom X-Request-Id header if valid UUID', async () => {
      const customId = '123e4567-e89b-12d3-a456-426614174000';
      const response = await request(app)
        .get('/health')
        .set('X-Request-Id', customId);
      expect(response.headers['x-request-id']).toBe(customId);
    });

    test('includes security headers from Helmet', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['x-dns-prefetch-control']).toBe('off');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('404 & Negative Error Handling', () => {
    test('returns 404 with structured error response for non-existent route', async () => {
      const response = await request(app).get('/api/v1/non-existent-route');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'ROUTE_NOT_FOUND');
      expect(response.body.error).toHaveProperty('requestId');
    });

    test('returns 400 Malformed JSON error response on malformed JSON payload', async () => {
      const response = await request(app)
        .post('/health')
        .set('Content-Type', 'application/json')
        .send('{ invalid json syntax: ');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'MALFORMED_JSON');
      expect(response.body.error.message).toContain('Invalid JSON payload');
    });

    test('returns 413 Payload Too Large when request payload exceeds 1MB limit', async () => {
      // Generate string slightly larger than 1MB
      const largePayload = 'a'.repeat(1024 * 1024 + 100);
      const response = await request(app)
        .post('/health')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ data: largePayload }));

      expect(response.status).toBe(413);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'PAYLOAD_TOO_LARGE');
    });
  });
});
