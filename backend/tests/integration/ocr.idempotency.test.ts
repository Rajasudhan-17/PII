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
import { ocrService } from '../../src/services/ocr/ocr.service';
import { IOCRProvider, OCRResult, IHandwritingRecognizer, HandwritingRecognizer } from '../../src/services/ocr/ocr.provider';

describe('OCR Idempotency & Soft-Delete Safety Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  const userCredentials = { email: 'IdempotencyOCR@Tenant.com', password: 'Password123!' };
  let authToken: string;
  let orgId: string;
  let docId: string;

  class MockOCRProvider implements IOCRProvider {
    public callCount = 0;

    async recognize(): Promise<OCRResult> {
      this.callCount++;
      return {
        text: 'Sample OCR Content',
        confidence: 90.0,
        blocks: [
          {
            text: 'Sample OCR Content',
            confidence: 90.0,
            lines: [
              {
                text: 'Sample OCR Content',
                confidence: 90.0,
                bbox: { x0: 0, y0: 0, x1: 100, y1: 20 },
                words: [
                  { text: 'Sample', confidence: 90.0, bbox: { x0: 0, y0: 0, x1: 40, y1: 20 } },
                  { text: 'OCR', confidence: 90.0, bbox: { x0: 45, y0: 0, x1: 70, y1: 20 } },
                  { text: 'Content', confidence: 90.0, bbox: { x0: 75, y0: 0, x1: 100, y1: 20 } },
                ],
              },
            ],
          },
        ],
        engineVersion: 'tesseract.js-5.1.1',
        recognitionMethod: 'PRINT_OCR',
      };
    }
  }

  let mockProvider: MockOCRProvider;

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

        mockProvider = new MockOCRProvider();
        const ocrServiceInternal = ocrService as unknown as { ocrProvider: IOCRProvider; htrRecognizer: IHandwritingRecognizer };
        ocrServiceInternal.ocrProvider = mockProvider;
        ocrServiceInternal.htrRecognizer = new HandwritingRecognizer(mockProvider);

        // 1. Setup user & org
        await request(app).post('/api/v1/auth/register').send(userCredentials);
        await User.updateOne({ email: userCredentials.email.toLowerCase() }, { role: 'ORG_ADMIN' });

        const loginRes = await request(app).post('/api/v1/auth/login').send(userCredentials);
        authToken = loginRes.body.accessToken;

        const orgRes = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Idempotency Org' });
        orgId = orgRes.body.organization.id;

        // 2. Upload document
        const sampleImgPath = path.resolve(process.cwd(), 'storage/idempotency_ocr.png');
        const pngHeader = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');
        await fs.promises.writeFile(sampleImgPath, pngHeader);

        const uploadRes = await request(app)
          .post(`/api/v1/organizations/${orgId}/documents`)
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', sampleImgPath, 'idempotency_ocr.png');

        docId = uploadRes.body.document.id;
        await fs.promises.unlink(sampleImgPath).catch(() => {});
      }
    } catch {
      // Allow fallback if DB offline
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await NormalizedDocumentModel.deleteMany({});
      await DocumentModel.deleteMany({});
      await OrganizationMembership.deleteMany({});
      await Organization.deleteMany({});
      await User.deleteMany({});
      await mongoose.connection.close();
    }
  });

  it('should reuse existing result on second OCR invocation (idempotency)', async () => {
    if (mongoose.connection.readyState !== 1) return;

    // First run
    await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/ocr?sync=true`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    const initialCalls = mockProvider.callCount;
    expect(initialCalls).toBeGreaterThan(0);

    // Second run without force
    const secondRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/ocr?sync=true`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(secondRes.status).toBe(200);
    // OCR provider should not be called again
    expect(mockProvider.callCount).toBe(initialCalls);
  });

  it('should reject OCR on a soft-deleted document', async () => {
    if (mongoose.connection.readyState !== 1) return;

    // Mark document as soft-deleted in DB
    await DocumentModel.updateOne({ _id: docId }, { isDeleted: true, status: 'DELETED' });

    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/ocr`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect([400, 404]).toContain(res.status);
  });
});
