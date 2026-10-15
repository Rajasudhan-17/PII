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

describe('OCR & HTR Integration Routes Tests', () => {
  let app: ReturnType<typeof createApp>;

  const userCredentials = { email: 'OCRUser@Tenant.com', password: 'Password123!' };
  let authToken: string;
  let orgId: string;
  let docId: string;

  class MockOCRProvider implements IOCRProvider {
    async recognize(): Promise<OCRResult> {
      return {
        text: 'Invoice Number: 98765\nTotal Amount: $150.00',
        confidence: 94.2,
        blocks: [
          {
            text: 'Invoice Number: 98765',
            confidence: 95.0,
            lines: [
              {
                text: 'Invoice Number: 98765',
                confidence: 95.0,
                bbox: { x0: 10, y0: 10, x1: 200, y1: 30 },
                words: [
                  { text: 'Invoice', confidence: 96.0, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 } },
                  { text: 'Number:', confidence: 95.0, bbox: { x0: 65, y0: 10, x1: 130, y1: 30 } },
                  { text: '98765', confidence: 94.0, bbox: { x0: 135, y0: 10, x1: 200, y1: 30 } },
                ],
              },
            ],
          },
          {
            text: 'Total Amount: $150.00',
            confidence: 93.4,
            lines: [
              {
                text: 'Total Amount: $150.00',
                confidence: 93.4,
                bbox: { x0: 10, y0: 40, x1: 200, y1: 60 },
                words: [
                  { text: 'Total', confidence: 94.0, bbox: { x0: 10, y0: 40, x1: 50, y1: 60 } },
                  { text: 'Amount:', confidence: 93.0, bbox: { x0: 55, y0: 40, x1: 120, y1: 60 } },
                  { text: '$150.00', confidence: 93.0, bbox: { x0: 125, y0: 40, x1: 200, y1: 60 } },
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

        // Inject mock OCR provider into ocrService
        const mockProv = new MockOCRProvider();
        const ocrServiceInternal = ocrService as unknown as { ocrProvider: IOCRProvider; htrRecognizer: IHandwritingRecognizer };
        ocrServiceInternal.ocrProvider = mockProv;
        ocrServiceInternal.htrRecognizer = new HandwritingRecognizer(mockProv);

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
          .send({ name: 'OCR Test Org' });
        orgId = orgRes.body.organization.id;

        // 4. Upload a sample document asset
        const sampleImgPath = path.resolve(process.cwd(), 'storage/test_ocr_sample.png');
        const pngHeader = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');
        await fs.promises.writeFile(sampleImgPath, pngHeader);

        const uploadRes = await request(app)
          .post(`/api/v1/organizations/${orgId}/documents`)
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', sampleImgPath, 'test_ocr_sample.png');

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

  it('should enqueue document OCR job (202 Accepted)', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/ocr`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ isHandwriting: false });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.documentId).toBe(docId);
    expect(res.body.data.status).toBe('OCR_QUEUED');
  });

  it('should execute synchronous document OCR processing (200 OK)', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/ocr?sync=true`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ isHandwriting: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('OCR_COMPLETED');

    const normDoc = await NormalizedDocumentModel.findOne({ documentId: docId });
    expect(normDoc).toBeDefined();
    expect(normDoc?.status).toBe('OCR_COMPLETED');
    expect(normDoc?.blocks.length).toBeGreaterThan(0);
    expect(normDoc?.blocks[0].recognitionMethod).toBe('PRINT_OCR');
    expect(normDoc?.blocks[0].confidence).toBeGreaterThan(0);
  });

  it('should fetch OCR status summary (200 OK)', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/ocr`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.documentId).toBe(docId);
    expect(res.body.data.ocrBlockCount).toBeGreaterThan(0);
    expect(res.body.data.averageConfidence).toBeGreaterThan(0);
    expect(res.body.data.recognitionMethods).toContain('PRINT_OCR');
  });
});
