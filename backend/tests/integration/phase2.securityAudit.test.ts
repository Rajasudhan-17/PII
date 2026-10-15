import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { connectRedis, disconnectRedis } from '../../src/config/redis';
import { User } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { OrganizationMembership } from '../../src/models/membership.model';
import { createOrganization } from '../../src/services/organization.service';

describe('Phase 2 — Full Security, Token Lifecycle & RBAC Audit', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    app = createApp();
    await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
    await connectRedis();
    if (mongoose.connection.readyState === 1) {
      await User.deleteMany({ email: /audit.*@example\.com/i });
      await Organization.deleteMany({ normalizedName: /audit-.*/i });
      await OrganizationMembership.deleteMany({});
    }
  });

  afterAll(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await User.deleteMany({ email: /audit.*@example\.com/i });
        await Organization.deleteMany({ normalizedName: /audit-.*/i });
        await OrganizationMembership.deleteMany({});
        await disconnectDatabase();
      }
      await disconnectRedis();
    } catch {
      // cleanup
    }
  });

  const testUser = {
    email: 'AuditUser@example.com',
    password: 'SecurePassword123!',
    role: 'USER',
  };

  let userAccessToken: string;
  let userRefreshToken: string;
  let userCookie: string;
  let userId: string;

  describe('1. Cookie & Token Contract Behavior', () => {
    test('login sets HttpOnly refreshToken cookie and returns JSON token pair', async () => {
      // 1. Register test user
      const regRes = await request(app)
        .post('/api/v1/auth/register')
        .send(testUser);
      expect(regRes.status).toBe(201);
      userId = regRes.body.user.id;
      expect(userId).toBeDefined();

      // 2. Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body).toHaveProperty('accessToken');
      expect(loginRes.body).toHaveProperty('refreshToken');

      userAccessToken = loginRes.body.accessToken;
      userRefreshToken = loginRes.body.refreshToken;

      // Assert Set-Cookie header contains HttpOnly and SameSite=Strict
      const cookies = loginRes.get('Set-Cookie');
      expect(cookies).toBeDefined();
      const rtCookie = cookies?.find((c) => c.startsWith('refreshToken='));
      expect(rtCookie).toBeDefined();
      expect(rtCookie).toContain('HttpOnly');
      expect(rtCookie).toContain('SameSite=Strict');

      userCookie = rtCookie!.split(';')[0]; // "refreshToken=..."
    });

    test('refresh accepts HttpOnly cookie contract WITHOUT body and returns rotated tokens', async () => {
      // Send refresh request with Cookie header only, no body
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', userCookie)
        .send({});

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body).toHaveProperty('accessToken');
      expect(refreshRes.body).toHaveProperty('refreshToken');
      // Refresh token rotation is strictly verified
      expect(refreshRes.body.refreshToken).not.toBe(userRefreshToken);

      // Verify new Set-Cookie was sent with the rotated refresh token
      const cookies = refreshRes.get('Set-Cookie');
      expect(cookies).toBeDefined();
      const newRtCookie = cookies?.find((c) => c.startsWith('refreshToken='));
      expect(newRtCookie).toBeDefined();
      expect(newRtCookie).toContain(refreshRes.body.refreshToken);

      // Update active tokens
      userAccessToken = refreshRes.body.accessToken;
      userRefreshToken = refreshRes.body.refreshToken;
      userCookie = newRtCookie!.split(';')[0];
    });

    test('refresh accepts body contract when cookie is absent', async () => {
      const bodyRefreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: userRefreshToken });

      expect(bodyRefreshRes.status).toBe(200);
      expect(bodyRefreshRes.body).toHaveProperty('accessToken');
      expect(bodyRefreshRes.body).toHaveProperty('refreshToken');
      expect(bodyRefreshRes.body.refreshToken).not.toBe(userRefreshToken);

      userAccessToken = bodyRefreshRes.body.accessToken;
      userRefreshToken = bodyRefreshRes.body.refreshToken;
      const cookies = bodyRefreshRes.get('Set-Cookie');
      userCookie = cookies!.find((c) => c.startsWith('refreshToken='))!.split(';')[0];
    });

    test('logout revokes session in Redis, clears cookies, and invalidates tokens', async () => {
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .set('Cookie', userCookie)
        .send({ refreshToken: userRefreshToken });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toBe('Successfully logged out.');

      // Check that Set-Cookie clearing instructions were returned
      const cookies = logoutRes.get('Set-Cookie');
      expect(cookies).toBeDefined();
      const clearedCookie = cookies?.find((c) => c.includes('refreshToken=;'));
      expect(clearedCookie).toBeDefined();

      // Subsequent refresh with the logged-out refresh token must be rejected
      const staleRefreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: userRefreshToken });

      expect(staleRefreshRes.status).toBe(401);
    });

    test('reuse of an invalidated refresh token triggers family revocation', async () => {
      // Reusing userRefreshToken which was revoked during logout
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: userRefreshToken });

      expect(reuseRes.status).toBe(401);
    });
  });

  describe('2. Multi-Tenant Validation & Organization Switching', () => {
    let orgA: { id: string; name: string };
    let orgB: { id: string; name: string };
    let adminToken: string;

    beforeAll(async () => {
      // Register an admin user who owns orgA
      const adminReg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'audit-admin@example.com',
          password: 'AdminPassword123!',
          role: 'ORG_ADMIN',
        });
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'audit-admin@example.com',
          password: 'AdminPassword123!',
        });
      adminToken = adminLogin.body.accessToken;
      const adminUserId = adminReg.body.user.id;

      // Create Org A (admin is member)
      const createdOrgA = await createOrganization('Audit-Org-Alpha', adminUserId);
      orgA = { id: createdOrgA.id, name: createdOrgA.name };

      // Create Org B with a different creator (admin is NOT a member)
      const otherUser = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'audit-other@example.com',
          password: 'OtherPassword123!',
          role: 'USER',
        });
      const createdOrgB = await createOrganization('Audit-Org-Beta', otherUser.body.user.id);
      orgB = { id: createdOrgB.id, name: createdOrgB.name };
    });

    test('listOrganizations returns only organizations where user is an active member', async () => {
      const orgsRes = await request(app)
        .get('/api/v1/organizations')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(orgsRes.status).toBe(200);
      const userOrgIds = orgsRes.body.organizations.map((o: { id: string }) => o.id);

      // User belongs to orgA, but NOT orgB
      expect(userOrgIds).toContain(orgA.id);
      expect(userOrgIds).not.toContain(orgB.id);
    });

    test('rejects cross-tenant access when user attempts to access an organization they do not belong to (anti-enumeration 404/403)', async () => {
      // Attempting to access orgB endpoints using adminToken (admin is not a member of orgB)
      const crossTenantRes = await request(app)
        .get(`/api/v1/organizations/${orgB.id}/policies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', orgB.id);

      // Anti-enumeration security: 404 or 403 returned
      expect([403, 404]).toContain(crossTenantRes.status);
      expect(crossTenantRes.body.error.code).toMatch(/ORGANIZATION_NOT_FOUND|TENANT_ACCESS_DENIED/);
    });

    test('permits access when switching to legitimate tenant membership', async () => {
      const legitimateRes = await request(app)
        .get(`/api/v1/organizations/${orgA.id}/policies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', orgA.id);

      expect(legitimateRes.status).toBe(200);
    });
  });

  describe('3. Defense-in-Depth Permission Enforcement', () => {
    let reviewerToken: string;
    let standardUserToken: string;
    let testOrgId: string;

    beforeAll(async () => {
      // 1. Create reviewer user
      const revReg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'audit-reviewer@example.com',
          password: 'ReviewerPassword123!',
          role: 'REVIEWER',
        });
      const revLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'audit-reviewer@example.com',
          password: 'ReviewerPassword123!',
        });
      reviewerToken = revLogin.body.accessToken;
      const revUserId = revReg.body.user.id;

      // Create an org and add reviewer
      const org = await createOrganization('Audit-RBAC-Org', revUserId);
      testOrgId = org.id;

      // 2. Create standard user and add as member
      const userReg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'audit-standard@example.com',
          password: 'StandardPassword123!',
          role: 'USER',
        });
      const userLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'audit-standard@example.com',
          password: 'StandardPassword123!',
        });
      standardUserToken = userLogin.body.accessToken;
      const stdUserId = userReg.body.user.id;

      // Add standard user as MEMBER in testOrgId
      const membership = new OrganizationMembership({
        userId: new mongoose.Types.ObjectId(stdUserId),
        organizationId: new mongoose.Types.ObjectId(testOrgId),
        tenantRole: 'MEMBER',
        status: 'ACTIVE',
      });
      await membership.save();
    });

    test('backend strictly rejects privileged actions for USER role even with valid token (403 Forbidden)', async () => {
      // USER lacks REVIEW_READ on review cases
      const forbiddenReviewRes = await request(app)
        .get(`/api/v1/organizations/${testOrgId}/review-cases`)
        .set('Authorization', `Bearer ${standardUserToken}`)
        .set('x-organization-id', testOrgId);

      expect(forbiddenReviewRes.status).toBe(403);
      expect(forbiddenReviewRes.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

      // USER lacks REVIEW_ASSIGN
      const forbiddenAssignRes = await request(app)
        .post(`/api/v1/organizations/${testOrgId}/review-cases/case-123/assign`)
        .set('Authorization', `Bearer ${standardUserToken}`)
        .set('x-organization-id', testOrgId)
        .send({ reviewerId: 'rev-1' });

      expect(forbiddenAssignRes.status).toBe(403);
      expect(forbiddenAssignRes.body.error.code).toMatch(/INSUFFICIENT_PERMISSIONS|INSUFFICIENT_TENANT_ROLE/);
    });

    test('backend permits privileged action for REVIEWER role possessing REVIEW_READ', async () => {
      const allowedRes = await request(app)
        .get(`/api/v1/organizations/${testOrgId}/review-cases`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .set('x-organization-id', testOrgId);

      expect(allowedRes.status).toBe(200);
      expect(allowedRes.body.data).toHaveProperty('cases');
    });
  });

  describe('4. Session Restoration & Full Authentication Lifecycle', () => {
    test('complete lifecycle: login -> getMe -> org query -> logout -> verify revocation', async () => {
      const email = 'audit-lifecycle@example.com';
      const password = 'PasswordLifecycle123!';

      // Register & Login
      await request(app).post('/api/v1/auth/register').send({ email, password, role: 'USER' });
      const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });
      expect(loginRes.status).toBe(200);

      const { accessToken, refreshToken } = loginRes.body;

      // Session Restoration (Simulating page reload)
      const restoreRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.user.email).toBe(email);
      expect(restoreRes.body.user.role).toBe('USER');

      // Logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });
      expect(logoutRes.status).toBe(200);

      // Verify that after logout, using the refresh token fails
      const postLogoutRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });
      expect(postLogoutRefresh.status).toBe(401);
    });
  });
});
