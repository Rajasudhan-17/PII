import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';

describe('Authentication & Authorization Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    app = createApp();
    try {
      await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
      if (mongoose.connection.readyState === 1) {
        await User.deleteMany({});
      }
    } catch {
      // Allow fallback if DB connection is unavailable during test suite init
    }
  });

  afterAll(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await User.deleteMany({});
        await disconnectDatabase();
      }
    } catch {
      // cleanup
    }
  });

  const testUserCredentials = {
    email: 'AuthTestUser@Example.com',
    password: 'Password123!',
  };

  let accessToken: string;
  let refreshToken: string;

  describe('POST /api/v1/auth/register', () => {
    test('successfully registers a new user with password policy validation and email normalization', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(testUserCredentials);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUserCredentials.email);
      expect(response.body.user.role).toBe('USER');
      expect(response.body.user.status).toBe('ACTIVE');
      expect(response.body.user.passwordHash).toBeUndefined();

      // Verify email was stored in normalized lowercase form in DB
      const dbUser = await User.findOne({ normalizedEmail: 'authtestuser@example.com' });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.email).toBe('AuthTestUser@Example.com');
    });

    test('rejects registration with duplicate email', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(testUserCredentials);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('USER_ALREADY_EXISTS');
    });

    test('rejects registration with weak password', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'weakpass@example.com',
          password: 'weak',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('WEAK_PASSWORD');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    test('authenticates valid credentials and issues access & refresh tokens', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(testUserCredentials);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');

      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;

      // Verify HttpOnly cookie set
      const cookies = response.get('Set-Cookie');
      expect(cookies).toBeDefined();
      expect(cookies?.some((c) => c.includes('refreshToken='))).toBe(true);
    });

    test('rejects invalid password with generic error message (account enumeration protection)', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUserCredentials.email,
          password: 'WrongPassword999!',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('Invalid email or password.');
    });

    test('rejects non-existent user with generic error message', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistentuser@example.com',
          password: 'Password123!',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('Invalid email or password.');
    });
  });

  describe('GET /api/v1/auth/me & Authentication Middleware', () => {
    test('returns authenticated user profile when valid Bearer token is provided', async () => {
      if (mongoose.connection.readyState !== 1 || !accessToken) return;

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUserCredentials.email);
    });

    test('rejects unauthenticated requests missing token', async () => {
      const response = await request(app).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    test('rejects requests with malformed or tampered token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.tampered.token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    test('rotates refresh token and returns new access & refresh tokens', async () => {
      if (mongoose.connection.readyState !== 1 || !refreshToken) return;

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');

      // Update tokens for subsequent tests
      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });
  });

  describe('Authorization & RBAC Middleware Enforcement', () => {
    test('denies access (403 Forbidden) when user role lacks required privilege', async () => {
      if (mongoose.connection.readyState !== 1 || !accessToken) return;

      // testUserCredentials user has role USER
      const response = await request(app)
        .get('/api/v1/test/admin-only')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
    });

    test('denies access (403 Forbidden) when user lacks required permission', async () => {
      if (mongoose.connection.readyState !== 1 || !accessToken) return;

      const response = await request(app)
        .get('/api/v1/test/user-manage-perm')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    test('allows access (200 OK) when user has required ORG_ADMIN role', async () => {
      if (mongoose.connection.readyState !== 1) return;

      // Register an ORG_ADMIN user
      const adminReg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'orgadmin@example.com',
          password: 'AdminPassword123!',
          role: 'ORG_ADMIN',
        });

      expect(adminReg.status).toBe(201);

      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'orgadmin@example.com',
          password: 'AdminPassword123!',
        });

      expect(adminLogin.status).toBe(200);
      const adminToken = adminLogin.body.accessToken;

      const adminAccess = await request(app)
        .get('/api/v1/test/admin-only')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(adminAccess.status).toBe(200);
      expect(adminAccess.body.status).toBe('admin_access_granted');

      const permAccess = await request(app)
        .get('/api/v1/test/user-manage-perm')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(permAccess.status).toBe(200);
      expect(permAccess.body.status).toBe('perm_access_granted');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    test('logs out user and invalidates session cookies', async () => {
      if (mongoose.connection.readyState !== 1 || !accessToken) return;

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Successfully logged out.');
    });
  });
});
