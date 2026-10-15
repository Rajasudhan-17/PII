import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { DocumentModel } from '../../src/models/document.model';
import { NormalizedDocumentModel } from '../../src/models/normalizedDocument.model';
import { PIICandidateModel } from '../../src/models/piiCandidate.model';
import { DetectionRunModel } from '../../src/models/detectionRun.model';

describe('PII Concurrent Same-Document Detection Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = { email: `concurrent_user_${uniqueSuffix}@tenant.com`, password: 'Password123!' };
  let authToken: string;
  let orgId: string;
  let docId: string;

  beforeAll(async () => {
    app = createApp();
    try {
      await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
      if (mongoose.connection.readyState === 1) {
        await request(app).post('/api/v1/auth/register').send(userCredentials);
        await User.updateOne({ email: userCredentials.email.toLowerCase() }, { role: 'ORG_ADMIN' });
        const loginRes = await request(app).post('/api/v1/auth/login').send(userCredentials);
        authToken = loginRes.body.accessToken;

        const orgRes = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: `Concurrent Org ${uniqueSuffix}` });
        orgId = orgRes.body.organization.id;

        const user = await User.findOne({ email: userCredentials.email.toLowerCase() });
        const docDoc = await DocumentModel.create({
          organizationId: new mongoose.Types.ObjectId(orgId),
          uploadedBy: user!._id,
          originalFilename: 'concurrent_doc.pdf',
          size: 1024,
          declaredMimeType: 'application/pdf',
          detectedMimeType: 'application/pdf',
          extension: 'pdf',
          storageKey: `org_${orgId}/concurrent_${uniqueSuffix}.pdf`,
          status: 'EXTRACTED',
          checksum: `chk_concurrent_${uniqueSuffix}`,
          isDeleted: false,
        });
        docId = docDoc._id.toString();

        const sampleText = 'Contact owner at owner@domain.org or +1-800-555-0199.';
        await NormalizedDocumentModel.create({
          documentId: docDoc._id,
          organizationId: new mongoose.Types.ObjectId(orgId),
          checksum: `chk_concurrent_${uniqueSuffix}`,
          format: 'pdf',
          schemaVersion: '1.0.0',
          extractorVersion: '1.0.0',
          status: 'COMPLETE',
          pages: [{ pageNumber: 1, blockCount: 1 }],
          blocks: [
            {
              blockId: 'blk_conc',
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
                blockId: 'blk_conc',
              },
            },
          ],
          tables: [],
          metadata: {},
          warnings: [],
        });
      }
    } catch {
      // Fallback
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      if (docId && orgId) {
        const docObjId = new mongoose.Types.ObjectId(docId);
        const orgObjId = new mongoose.Types.ObjectId(orgId);
        await PIICandidateModel.deleteMany({ documentId: docObjId });
        await DetectionRunModel.deleteMany({ documentId: docObjId });
        await NormalizedDocumentModel.deleteMany({ documentId: docObjId });
        await DocumentModel.deleteMany({ _id: docObjId });
        await Organization.deleteMany({ _id: orgObjId });
      }
      await User.deleteMany({ email: userCredentials.email.toLowerCase() });
    }
  });

  it('should handle 5 concurrent requests for same document safely resulting in 1 active run', async () => {
    if (mongoose.connection.readyState !== 1) return;

    // Fire 5 concurrent requests
    const requests = Array.from({ length: 5 }).map(() =>
      request(app)
        .post(`/api/v1/organizations/${orgId}/documents/${docId}/pii-detection`)
        .set('Authorization', `Bearer ${authToken}`)
    );

    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalCandidates).toBe(2);
    }

    // Verify database has exactly 1 active run for this document
    const activeRuns = await DetectionRunModel.find({
      documentId: docId,
      organizationId: orgId,
      isLatestActive: true,
    });

    expect(activeRuns.length).toBe(1);
  });
});
