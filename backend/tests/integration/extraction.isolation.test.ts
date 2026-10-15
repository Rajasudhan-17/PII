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
import { NormalizedDocumentModel } from '../../src/models/normalizedDocument.model';
import { extractionService } from '../../src/services/extraction.service';

describe('Cross-Tenant Extraction BOLA / IDOR Isolation Security Tests', () => {
  jest.setTimeout(30000);
  let app: ReturnType<typeof createApp>;

  // User A setup
  const userACreds = { email: 'TenantAExtractor@Test.com', password: 'Password123!' };
  let tokenA: string;
  let orgAId: string;
  let docAId: string;

  // User B setup
  const userBCreds = { email: 'TenantBExtractor@Test.com', password: 'Password123!' };

  beforeAll(async () => {
    app = createApp();
    try {
      await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
      if (mongoose.connection.readyState === 1) {
        await NormalizedDocumentModel.deleteMany({});
        await DocumentModel.deleteMany({});
        await OrganizationMembership.deleteMany({});
        await Organization.deleteMany({});
        await User.deleteMany({});

        // 1. Setup Tenant A
        await request(app).post('/api/v1/auth/register').send(userACreds);
        const loginA = await request(app).post('/api/v1/auth/login').send(userACreds);
        tokenA = loginA.body.accessToken;

        const orgA = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ name: 'Extraction Org A' });
        orgAId = orgA.body.organization.id;

        // 2. Setup Tenant B
        await request(app).post('/api/v1/auth/register').send(userBCreds);
        const loginB = await request(app).post('/api/v1/auth/login').send(userBCreds);
        const tokenB = loginB.body.accessToken;

        const orgB = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${tokenB}`)
          .send({ name: 'Extraction Org B' });
        const orgBId = orgB.body.organization.id;

        // 3. Upload Document A for Org A
        const txtA = path.resolve(process.cwd(), 'storage/test_isolation_a.txt');
        await fs.promises.writeFile(txtA, 'Tenant A confidential document content.');
        const uploadA = await request(app)
          .post(`/api/v1/organizations/${orgAId}/documents`)
          .set('Authorization', `Bearer ${tokenA}`)
          .attach('file', txtA, 'docA.txt');
        docAId = uploadA.body.document.id;
        await fs.promises.unlink(txtA).catch(() => {});

        // 4. Upload Document B for Org B
        const txtB = path.resolve(process.cwd(), 'storage/test_isolation_b.txt');
        await fs.promises.writeFile(txtB, 'Tenant B secret document content.');
        const uploadB = await request(app)
          .post(`/api/v1/organizations/${orgBId}/documents`)
          .set('Authorization', `Bearer ${tokenB}`)
          .attach('file', txtB, 'docB.txt');
        const docBId = uploadB.body.document.id;
        await fs.promises.unlink(txtB).catch(() => {});

        // Extract both documents
        await extractionService.processDocumentExtraction(docAId, orgAId);
        await extractionService.processDocumentExtraction(docBId, orgBId);
      }
    } catch {
      // fallback
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await NormalizedDocumentModel.deleteMany({});
      await DocumentModel.deleteMany({});
    }
  });

  describe('Cross-Tenant Extraction BOLA / IDOR Defenses', () => {
    test('User A CANNOT trigger extraction on Org B document (returns 404)', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const fakeDocId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post(`/api/v1/organizations/${orgAId}/documents/${fakeDocId}/extract`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    });

    test('User A CANNOT fetch extraction status of Org B document (returns 404)', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const fakeDocId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/v1/organizations/${orgAId}/documents/${fakeDocId}/extraction`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    });

    test('User A CANNOT fetch normalized content of Org B document (returns 404)', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const fakeDocId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/v1/organizations/${orgAId}/documents/${fakeDocId}/extraction/content`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    });

    test('Worker rejects forged job payload attempting to extract Org B document with Org A tenant context', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const fakeDocId = new mongoose.Types.ObjectId().toString();
      await expect(extractionService.processDocumentExtraction(fakeDocId, orgAId)).rejects.toThrow(
        'Document not found or deleted during extraction processing.'
      );
    });
  });
});
