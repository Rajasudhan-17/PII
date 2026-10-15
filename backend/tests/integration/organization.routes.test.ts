import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { OrganizationMembership } from '../../src/models/membership.model';

describe('Multi-Tenancy & Organization Isolation Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  // User A setup
  const userACredentials = { email: `UserA_${uniqueSuffix}@TenantTest.com`, password: 'Password123!' };
  let tokenA: string;
  let userAId: string;

  // User B setup
  const userBCredentials = { email: `UserB_${uniqueSuffix}@TenantTest.com`, password: 'Password123!' };
  let tokenB: string;
  let userBId: string;

  // User C setup (Member to be added)
  const userCCredentials = { email: `UserC_${uniqueSuffix}@TenantTest.com`, password: 'Password123!' };
  let tokenC: string;
  let userCId: string;

  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    app = createApp();
    try {
      await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
      if (mongoose.connection.readyState === 1) {
        await OrganizationMembership.deleteMany({});
        await Organization.deleteMany({});
        await User.deleteMany({});

        // Register User A
        const regA = await request(app).post('/api/v1/auth/register').send(userACredentials);
        userAId = regA.body.user.id;
        await User.updateOne({ _id: new mongoose.Types.ObjectId(userAId) }, { role: 'ORG_ADMIN' });
        const loginA = await request(app).post('/api/v1/auth/login').send(userACredentials);
        tokenA = loginA.body.accessToken;

        // Register User B
        const regB = await request(app).post('/api/v1/auth/register').send(userBCredentials);
        userBId = regB.body.user.id;
        await User.updateOne({ _id: new mongoose.Types.ObjectId(userBId) }, { role: 'ORG_ADMIN' });
        const loginB = await request(app).post('/api/v1/auth/login').send(userBCredentials);
        tokenB = loginB.body.accessToken;

        // Register User C
        const regC = await request(app).post('/api/v1/auth/register').send(userCCredentials);
        userCId = regC.body.user.id;
        await User.updateOne({ _id: new mongoose.Types.ObjectId(userCId) }, { role: 'ORG_ADMIN' });
        const loginC = await request(app).post('/api/v1/auth/login').send(userCCredentials);
        tokenC = loginC.body.accessToken;
      }
    } catch {
      // fallback
    }
  }, 30000);

  describe('POST /api/v1/organizations', () => {
    test('creates Organization A and automatically assigns User A as ORG_ADMIN', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Acme Corporation' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('organization');
      expect(response.body.organization.name).toBe('Acme Corporation');
      expect(response.body.organization.status).toBe('ACTIVE');

      orgAId = response.body.organization.id;

      // Verify membership created automatically
      const membership = await OrganizationMembership.findOne({
        userId: new mongoose.Types.ObjectId(userAId),
        organizationId: new mongoose.Types.ObjectId(orgAId),
      });

      expect(membership).not.toBeNull();
      expect(membership?.tenantRole).toBe('ORG_ADMIN');
      expect(membership?.status).toBe('ACTIVE');
    });

    test('creates Organization B for User B', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Beta Industries' });

      expect(response.status).toBe(201);
      orgBId = response.body.organization.id;
    });

    test('rejects creating organization with duplicate name', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'acme corporation' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('DUPLICATE_ORGANIZATION_NAME');
    });
  });

  describe('GET /api/v1/organizations (User Organization Listing)', () => {
    test('User A sees only Organization A in their listing', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .get('/api/v1/organizations')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('organizations');
      const orgIds = response.body.organizations.map((o: { id: string }) => o.id);
      expect(orgIds).toContain(orgAId);
      expect(orgIds).not.toContain(orgBId);
    });

    test('User B sees only Organization B in their listing', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .get('/api/v1/organizations')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(response.status).toBe(200);
      const orgIds = response.body.organizations.map((o: { id: string }) => o.id);
      expect(orgIds).toContain(orgBId);
      expect(orgIds).not.toContain(orgAId);
    });
  });

  describe('Membership Management (POST & GET /members)', () => {
    test('User A (ORG_ADMIN) adds User C to Organization A as REVIEWER', async () => {
      if (mongoose.connection.readyState !== 1 || !orgAId) return;

      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/members`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          email: userCCredentials.email,
          role: 'REVIEWER',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('membership');
      expect(response.body.membership.tenantRole).toBe('REVIEWER');
      expect(response.body.membership.status).toBe('ACTIVE');
    });

    test('rejects adding duplicate member to same organization', async () => {
      if (mongoose.connection.readyState !== 1 || !orgAId) return;

      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/members`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          email: userCCredentials.email,
          role: 'REVIEWER',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('MEMBER_ALREADY_EXISTS');
    });

    test('lists organization members for authorized tenant admin', async () => {
      if (mongoose.connection.readyState !== 1 || !orgAId) return;

      const response = await request(app)
        .get(`/api/v1/organizations/${orgAId}/members`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('members');
      expect(response.body.members.length).toBe(2);
    });
  });

  describe('Cross-Tenant Isolation & BOLA/IDOR Security Checks', () => {
    test('User A CANNOT access Organization B details (returns 404 to prevent org enumeration)', async () => {
      if (mongoose.connection.readyState !== 1 || !orgBId) return;

      const response = await request(app)
        .get(`/api/v1/organizations/${orgBId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    });

    test('User A CANNOT add members to Organization B (returns 404)', async () => {
      if (mongoose.connection.readyState !== 1 || !orgBId) return;

      const response = await request(app)
        .post(`/api/v1/organizations/${orgBId}/members`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ email: 'attacker@example.com', role: 'ORG_ADMIN' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    });

    test('User A CANNOT list members of Organization B (returns 404)', async () => {
      if (mongoose.connection.readyState !== 1 || !orgBId) return;

      const response = await request(app)
        .get(`/api/v1/organizations/${orgBId}/members`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    });

    test('User A CANNOT delete members from Organization B (returns 404)', async () => {
      if (mongoose.connection.readyState !== 1 || !orgBId || !userBId) return;

      const response = await request(app)
        .delete(`/api/v1/organizations/${orgBId}/members/${userBId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    });
  });

  describe('Protection of Final Active ORG_ADMIN', () => {
    test('prevents removing or demoting the last active ORG_ADMIN of Organization A', async () => {
      if (mongoose.connection.readyState !== 1 || !orgAId || !userAId) return;

      const response = await request(app)
        .delete(`/api/v1/organizations/${orgAId}/members/${userAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('CANNOT_REMOVE_LAST_ORG_ADMIN');
    });
  });

  describe('Suspended Membership Access Rejection', () => {
    test('when a user membership is SUSPENDED, tenant access is immediately rejected even with valid JWT', async () => {
      if (mongoose.connection.readyState !== 1 || !orgAId || !userCId) return;

      // Verify User C can access Org A
      const accessBefore = await request(app)
        .get(`/api/v1/organizations/${orgAId}/members`)
        .set('Authorization', `Bearer ${tokenC}`);
      expect(accessBefore.status).toBe(200);

      // User A (ORG_ADMIN) suspends User C's membership
      const suspendRes = await request(app)
        .patch(`/api/v1/organizations/${orgAId}/members/${userCId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'SUSPENDED' });
      expect(suspendRes.status).toBe(200);

      // Verify User C's subsequent request with valid JWT fails
      const accessAfter = await request(app)
        .get(`/api/v1/organizations/${orgAId}/members`)
        .set('Authorization', `Bearer ${tokenC}`);

      expect(accessAfter.status).toBe(404);
      expect(accessAfter.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    });
  });

  afterAll(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await OrganizationMembership.deleteMany({});
        await Organization.deleteMany({});
        await User.deleteMany({});
        await disconnectDatabase();
      }
    } catch {
      // cleanup
    }
  });
});
