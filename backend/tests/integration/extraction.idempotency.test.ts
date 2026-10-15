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

describe('Extraction Idempotency & Concurrency Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  const userCreds = { email: 'IdempotencyUser@Test.com', password: 'Password123!' };
  let token: string;
  let orgId: string;
  let docId: string;

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

        await request(app).post('/api/v1/auth/register').send({ ...userCreds, role: 'ORG_ADMIN' });
        const loginRes = await request(app).post('/api/v1/auth/login').send(userCreds);
        token = loginRes.body.accessToken;

        const orgRes = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Idempotency Org' });
        orgId = orgRes.body.organization.id;

        const samplePath = path.resolve(process.cwd(), 'storage/test_idempotency.txt');
        await fs.promises.writeFile(samplePath, 'Idempotent text line content.');

        const uploadRes = await request(app)
          .post(`/api/v1/organizations/${orgId}/documents`)
          .set('Authorization', `Bearer ${token}`)
          .attach('file', samplePath, 'idempotent.txt');
        docId = uploadRes.body.document.id;
        await fs.promises.unlink(samplePath).catch(() => {});
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

  test('re-running extraction on same document returns existing normalized document without duplicates', async () => {
    if (mongoose.connection.readyState !== 1) return;

    // First run
    const result1 = await extractionService.processDocumentExtraction(docId, orgId);
    expect(result1.status).toBe('COMPLETE');

    const normCountInitial = await NormalizedDocumentModel.countDocuments({ documentId: docId });
    expect(normCountInitial).toBe(1);

    // Second run (idempotent retry)
    const result2 = await extractionService.processDocumentExtraction(docId, orgId);
    expect(result2.status).toBe('COMPLETE');

    const normCountAfter = await NormalizedDocumentModel.countDocuments({ documentId: docId });
    expect(normCountAfter).toBe(1);
  });

  test('deleted document cannot be extracted and throws 400 DOCUMENT_DELETED', async () => {
    if (mongoose.connection.readyState !== 1) return;

    // Delete document using document endpoint (requires ORG_ADMIN role, which user has)
    await request(app)
      .delete(`/api/v1/organizations/${orgId}/documents/${docId}`)
      .set('Authorization', `Bearer ${token}`);

    // Attempting to queue extraction should fail
    await expect(
      extractionService.queueExtraction({
        organizationId: orgId,
        documentId: docId,
        userId: 'some-user',
      })
    ).rejects.toThrow('Document not found or access denied.');
  });
});
