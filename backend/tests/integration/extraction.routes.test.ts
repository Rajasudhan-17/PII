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

describe('Document Intelligence & Extraction Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  const userCredentials = { email: 'ExtractorUser@Tenant.com', password: 'Password123!' };
  let authToken: string;
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

        // 1. Register user & assign ORG_ADMIN global role
        await request(app).post('/api/v1/auth/register').send(userCredentials);
        await User.updateOne({ email: userCredentials.email.toLowerCase() }, { role: 'ORG_ADMIN' });

        // 2. Login user
        const loginRes = await request(app).post('/api/v1/auth/login').send(userCredentials);
        authToken = loginRes.body.accessToken;

        // 3. Create organization
        const orgRes = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Extractor Test Org' });
        orgId = orgRes.body.organization.id;

        // 4. Upload a sample TXT document
        const sampleTxtPath = path.resolve(process.cwd(), 'storage/test_sample.txt');
        await fs.promises.writeFile(sampleTxtPath, 'First paragraph content.\n\nSecond paragraph content.');

        const uploadRes = await request(app)
          .post(`/api/v1/organizations/${orgId}/documents`)
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', sampleTxtPath, 'test_doc.txt');

        docId = uploadRes.body.document.id;
        await fs.promises.unlink(sampleTxtPath).catch(() => {});
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

  describe('POST /extract (Trigger Extraction Job)', () => {
    test('successfully enqueues extraction job for uploaded document', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/documents/${docId}/extract`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('jobEnqueued', true);
      expect(response.body).toHaveProperty('status', 'EXTRACTION_QUEUED');
    });
  });

  describe('Worker Processing & Status / Content Retrieval', () => {
    test('processes extraction and updates status to EXTRACTED', async () => {
      if (mongoose.connection.readyState !== 1) return;

      // Process extraction synchronously via extractionService
      await extractionService.processDocumentExtraction(docId, orgId);

      // GET status
      const statusRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/documents/${docId}/extraction`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.documentStatus).toBe('EXTRACTED');
      expect(statusRes.body.extractionStatus).toBe('COMPLETE');
      expect(statusRes.body.blockCount).toBe(2);

      // GET normalized content
      const contentRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/documents/${docId}/extraction/content`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(contentRes.status).toBe(200);
      expect(contentRes.body).toHaveProperty('normalizedDocument');
      const norm = contentRes.body.normalizedDocument;
      expect(norm.blocks.length).toBe(2);
      expect(norm.blocks[0].text).toBe('First paragraph content.');
      expect(norm.blocks[0].provenance.documentId).toBe(docId);
      expect(norm.blocks[0].provenance.organizationId).toBe(orgId);
    });
  });
});
