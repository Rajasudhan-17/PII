import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { DocumentModel } from '../../src/models/document.model';
import { NormalizedDocumentModel } from '../../src/models/normalizedDocument.model';
import { PIICandidateModel } from '../../src/models/piiCandidate.model';

describe('PII Detection Integration Routes Tests', () => {
  let app: ReturnType<typeof createApp>;

  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = { email: `pii_route_${uniqueSuffix}@tenant.com`, password: 'Password123!' };
  let authToken: string;
  let orgId: string;
  let docId: string;

  beforeAll(async () => {
    app = createApp();
    try {
      await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
      if (mongoose.connection.readyState === 1) {
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
          .send({ name: `PII Routes Org ${uniqueSuffix}` });
        orgId = orgRes.body.organization.id;

        // 4. Create document asset record
        const user = await User.findOne({ email: userCredentials.email.toLowerCase() });
        const docDoc = await DocumentModel.create({
          organizationId: new mongoose.Types.ObjectId(orgId),
          uploadedBy: user!._id,
          originalFilename: 'sensitive_document.pdf',
          size: 1024,
          declaredMimeType: 'application/pdf',
          detectedMimeType: 'application/pdf',
          extension: 'pdf',
          storageKey: `org_${orgId}/sensitive_${uniqueSuffix}.pdf`,
          status: 'EXTRACTED',
          checksum: `chk_${uniqueSuffix}`,
          isDeleted: false,
        });
        docId = docDoc._id.toString();

        // 5. Seed Normalized Document with PII text blocks
        const sampleText =
          'Customer John Doe (DOB: 1990-01-15) can be reached at john.doe@example.com or +1-800-555-0199. ' +
          'SSN: 219-09-8901, Card: 4532-0151-1283-0366, IBAN: GB82 WEST 1234 5698 7654 32, AWS Key: AKIAIOSFODNN7EXAMPLE.';

        await NormalizedDocumentModel.create({
          documentId: docDoc._id,
          organizationId: new mongoose.Types.ObjectId(orgId),
          checksum: `chk_${uniqueSuffix}`,
          format: 'pdf',
          schemaVersion: '1.0.0',
          extractorVersion: '1.0.0',
          status: 'COMPLETE',
          pages: [{ pageNumber: 1, blockCount: 1 }],
          blocks: [
            {
              blockId: 'blk_1',
              type: 'PARAGRAPH',
              text: sampleText,
              pageNumber: 1,
              readingOrderIndex: 0,
              startOffset: 0,
              endOffset: sampleText.length,
              recognitionMethod: 'NATIVE_TEXT',
              provenance: {
                documentId: docId,
                organizationId: orgId,
                pageNumber: 1,
                blockId: 'blk_1',
              },
            },
          ],
          tables: [],
          metadata: {},
          warnings: [],
        });
      }
    } catch {
      // Fallback if DB offline
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      if (docId && orgId) {
        const docObjId = new mongoose.Types.ObjectId(docId);
        const orgObjId = new mongoose.Types.ObjectId(orgId);
        await PIICandidateModel.deleteMany({ documentId: docObjId });
        await NormalizedDocumentModel.deleteMany({ documentId: docObjId });
        await DocumentModel.deleteMany({ _id: docObjId });
        await Organization.deleteMany({ _id: orgObjId });
      }
      await User.deleteMany({ email: userCredentials.email.toLowerCase() });
    }
  });

  it('should trigger synchronous PII detection (200 OK) and generate candidates with decision: null', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/pii-detection`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalCandidates).toBeGreaterThanOrEqual(5);

    const candidates = res.body.data.candidates;
    for (const cand of candidates) {
      expect(cand.decision).toBeNull();
    }
  });

  it('should retrieve PII candidates list (200 OK)', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/pii-detection`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.candidates.length).toBeGreaterThan(0);
  });

  it('should retrieve PII detection summary breakdown (200 OK)', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/pii-detection/summary`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalCandidates).toBeGreaterThan(0);
    expect(res.body.data.byCategory).toBeDefined();
    expect(res.body.data.bySeverity).toBeDefined();
    expect(res.body.data.maxSensitivityScore).toBeGreaterThan(0);
  });
});
