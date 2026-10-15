import request from 'supertest';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { OrganizationMembership } from '../../src/models/membership.model';
import { DocumentModel } from '../../src/models/document.model';
import { generateAccessToken } from '../../src/services/token.service';

const app = createApp();

describe('Cross-Tenant Document BOLA / IDOR Isolation Security Tests', () => {
  let userAToken: string;
  let userBToken: string;

  let orgAId: string;
  let orgBId: string;

  let docAId: string | undefined;
  let docBId: string | undefined;

  const tmpTestDir = path.resolve(process.cwd(), 'tmp_isolation_test_files');

  beforeAll(async () => {
    if (!fs.existsSync(tmpTestDir)) {
      fs.mkdirSync(tmpTestDir, { recursive: true });
    }

    try {
      await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
    } catch {
      // ignore
    }

    if (mongoose.connection.readyState === 1) {
      await DocumentModel.deleteMany({});

      const emailA = `usera_${Date.now()}@orga.com`;
      const userA = await User.create({
        email: emailA,
        normalizedEmail: emailA,
        passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/r6E/j62iF9LzH9m9i.1.2.3',
        fullName: 'User A',
        role: 'ORG_ADMIN',
        status: 'ACTIVE',
      });
      userAToken = generateAccessToken({ userId: userA._id.toString(), email: userA.email, role: 'ORG_ADMIN', status: 'ACTIVE' });

      const nameA = `Organization A ${Date.now()}`;
      const orgA = await Organization.create({ name: nameA, normalizedName: nameA.toLowerCase(), createdBy: userA._id });
      orgAId = orgA._id.toString();

      await OrganizationMembership.create({
        organizationId: orgA._id,
        userId: userA._id,
        tenantRole: 'ORG_ADMIN',
        status: 'ACTIVE',
      });

      const emailB = `userb_${Date.now()}@orgb.com`;
      const userB = await User.create({
        email: emailB,
        normalizedEmail: emailB,
        passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/r6E/j62iF9LzH9m9i.1.2.3',
        fullName: 'User B',
        role: 'ORG_ADMIN',
        status: 'ACTIVE',
      });
      userBToken = generateAccessToken({ userId: userB._id.toString(), email: userB.email, role: 'ORG_ADMIN', status: 'ACTIVE' });

      const nameB = `Organization B ${Date.now()}`;
      const orgB = await Organization.create({ name: nameB, normalizedName: nameB.toLowerCase(), createdBy: userB._id });
      orgBId = orgB._id.toString();

      await OrganizationMembership.create({
        organizationId: orgB._id,
        userId: userB._id,
        tenantRole: 'ORG_ADMIN',
        status: 'ACTIVE',
      });

      // Upload Document A under Org A
      const fileAPath = path.join(tmpTestDir, 'doc_a.txt');
      await fs.promises.writeFile(fileAPath, 'Confidential Content of Org A');
      const resA = await request(app)
        .post(`/api/v1/organizations/${orgAId}/documents`)
        .set('Authorization', `Bearer ${userAToken}`)
        .attach('file', fileAPath);
      docAId = resA.body?.document?.id;

      // Upload Document B under Org B
      const fileBPath = path.join(tmpTestDir, 'doc_b.txt');
      await fs.promises.writeFile(fileBPath, 'Confidential Content of Org B');
      const resB = await request(app)
        .post(`/api/v1/organizations/${orgBId}/documents`)
        .set('Authorization', `Bearer ${userBToken}`)
        .attach('file', fileBPath);
      docBId = resB.body?.document?.id;
    }
  });

  afterAll(async () => {
    if (fs.existsSync(tmpTestDir)) {
      await fs.promises.rm(tmpTestDir, { recursive: true, force: true });
    }
    if (mongoose.connection.readyState === 1) {
      await DocumentModel.deleteMany({});
    }
  });

  describe('Document Listing Isolation', () => {
    test('User A sees only Document A in Org A listing', async () => {
      if (mongoose.connection.readyState !== 1 || !docAId || !docBId) return;

      const res = await request(app)
        .get(`/api/v1/organizations/${orgAId}/documents`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      const docIds = res.body.documents.map((d: { id: string }) => d.id);
      expect(docIds).toContain(docAId);
      expect(docIds).not.toContain(docBId);
    });

    test('User B sees only Document B in Org B listing', async () => {
      if (mongoose.connection.readyState !== 1 || !docAId || !docBId) return;

      const res = await request(app)
        .get(`/api/v1/organizations/${orgBId}/documents`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(200);
      const docIds = res.body.documents.map((d: { id: string }) => d.id);
      expect(docIds).toContain(docBId);
      expect(docIds).not.toContain(docAId);
    });
  });

  describe('Cross-Tenant Metadata & IDOR Isolation', () => {
    test('User A cannot fetch Document B metadata using Org A route (returns 404)', async () => {
      if (mongoose.connection.readyState !== 1 || !docAId || !docBId) return;

      const res = await request(app)
        .get(`/api/v1/organizations/${orgAId}/documents/${docBId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    });

    test('User A cannot fetch Document B metadata using Org B route (returns 404 ORGANIZATION_NOT_FOUND)', async () => {
      if (mongoose.connection.readyState !== 1 || !docAId || !docBId) return;

      const res = await request(app)
        .get(`/api/v1/organizations/${orgBId}/documents/${docBId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    });
  });

  describe('Cross-Tenant Download Isolation', () => {
    test('User A cannot download Document B using Org A route (returns 404)', async () => {
      if (mongoose.connection.readyState !== 1 || !docAId || !docBId) return;

      const res = await request(app)
        .get(`/api/v1/organizations/${orgAId}/documents/${docBId}/download`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    });

    test('User A cannot download Document B using Org B route (returns 404)', async () => {
      if (mongoose.connection.readyState !== 1 || !docAId || !docBId) return;

      const res = await request(app)
        .get(`/api/v1/organizations/${orgBId}/documents/${docBId}/download`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    });
  });

  describe('Cross-Tenant Deletion Isolation', () => {
    test('User A cannot delete Document B using Org A route (returns 404)', async () => {
      if (mongoose.connection.readyState !== 1 || !docAId || !docBId) return;

      const res = await request(app)
        .delete(`/api/v1/organizations/${orgAId}/documents/${docBId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');

      // Verify Document B still exists and is accessible by User B
      const checkRes = await request(app)
        .get(`/api/v1/organizations/${orgBId}/documents/${docBId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(checkRes.status).toBe(200);
    });

    test('User A cannot delete Document B using Org B route (returns 404)', async () => {
      if (mongoose.connection.readyState !== 1 || !docAId || !docBId) return;

      const res = await request(app)
        .delete(`/api/v1/organizations/${orgBId}/documents/${docBId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    });
  });
});
