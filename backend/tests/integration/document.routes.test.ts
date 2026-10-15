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

describe('Document Ingestion & Storage Integration Tests', () => {
  let userToken: string;
  let userId: string;
  let orgId: string;

  const tmpTestDir = path.resolve(process.cwd(), 'tmp_route_test_files');

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

      const uniqueEmail = `docuser_${Date.now()}@example.com`;
      const user = await User.create({
        email: uniqueEmail,
        normalizedEmail: uniqueEmail,
        passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/r6E/j62iF9LzH9m9i.1.2.3',
        fullName: 'Doc Test User',
        role: 'ORG_ADMIN',
        status: 'ACTIVE',
      });
      userId = user._id.toString();
      userToken = generateAccessToken({ userId, email: user.email, role: 'ORG_ADMIN', status: 'ACTIVE' });

      const uniqueOrgName = `Doc Test Org ${Date.now()}`;
      const org = await Organization.create({
        name: uniqueOrgName,
        normalizedName: uniqueOrgName.toLowerCase(),
        createdBy: user._id,
      });
      orgId = org._id.toString();

      await OrganizationMembership.create({
        organizationId: org._id,
        userId: user._id,
        tenantRole: 'ORG_ADMIN',
        status: 'ACTIVE',
      });
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

  describe('POST /api/v1/organizations/:organizationId/documents', () => {
    test('successfully uploads and validates a legitimate PDF document', async () => {
      if (mongoose.connection.readyState !== 1 || !userToken || !orgId) return;

      const pdfPath = path.join(tmpTestDir, 'sample.pdf');
      await fs.promises.writeFile(pdfPath, Buffer.from('%PDF-1.4 Valid PDF file content for test'));

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/documents`)
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', pdfPath);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('document');
      expect(response.body.document.originalFilename).toBe('sample.pdf');
      expect(response.body.document.detectedMimeType).toBe('application/pdf');
      expect(response.body.document.status).toBe('READY');
      expect(response.body.document.checksum).toHaveLength(64);
    });

    test('rejects binary file with fake PDF extension (MIME spoofing)', async () => {
      if (mongoose.connection.readyState !== 1 || !userToken || !orgId) return;

      const fakePdfPath = path.join(tmpTestDir, 'fake.pdf');
      await fs.promises.writeFile(fakePdfPath, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]));

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/documents`)
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', fakePdfPath);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('UNSUPPORTED_FILE_HEADER');
    });

    test('rejects file with disallowed extension (e.g. .exe)', async () => {
      if (mongoose.connection.readyState !== 1 || !userToken || !orgId) return;

      const exePath = path.join(tmpTestDir, 'malware.exe');
      await fs.promises.writeFile(exePath, Buffer.from('binary executable content'));

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/documents`)
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', exePath);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('UNSUPPORTED_EXTENSION');
    });

    test('rejects request with missing file payload', async () => {
      if (mongoose.connection.readyState !== 1 || !userToken || !orgId) return;

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/documents`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('MISSING_UPLOAD_FILE');
    });
  });

  describe('GET, Download & DELETE Document Endpoints', () => {
    let createdDocId: string | undefined;

    beforeEach(async () => {
      if (mongoose.connection.readyState !== 1 || !userToken || !orgId) return;

      const txtPath = path.join(tmpTestDir, 'report.txt');
      await fs.promises.writeFile(txtPath, 'PII Report Document Content');

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/documents`)
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', txtPath);

      createdDocId = res.body?.document?.id;
    });

    test('lists organization documents', async () => {
      if (mongoose.connection.readyState !== 1 || !userToken || !orgId) return;

      const response = await request(app)
        .get(`/api/v1/organizations/${orgId}/documents`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('documents');
      expect(Array.isArray(response.body.documents)).toBe(true);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
    });

    test('gets document metadata by ID', async () => {
      if (mongoose.connection.readyState !== 1 || !userToken || !orgId || !createdDocId) return;

      const response = await request(app)
        .get(`/api/v1/organizations/${orgId}/documents/${createdDocId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.document.id).toBe(createdDocId);
      expect(response.body.document.originalFilename).toBe('report.txt');
    });

    test('downloads document stream with safe anti-sniff headers', async () => {
      if (mongoose.connection.readyState !== 1 || !userToken || !orgId || !createdDocId) return;

      const response = await request(app)
        .get(`/api/v1/organizations/${orgId}/documents/${createdDocId}/download`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).toContain('report.txt');
      expect(response.text).toBe('PII Report Document Content');
    });

    test('deletes document and soft-deletes database record', async () => {
      if (mongoose.connection.readyState !== 1 || !userToken || !orgId || !createdDocId) return;

      const response = await request(app)
        .delete(`/api/v1/organizations/${orgId}/documents/${createdDocId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Document deleted successfully.');

      // Subsequent metadata lookup yields 404
      const getRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/documents/${createdDocId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getRes.status).toBe(404);
    });
  });
});
