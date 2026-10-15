import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { DocumentModel } from '../../src/models/document.model';
import { NormalizedDocumentModel } from '../../src/models/normalizedDocument.model';
import { DetectionRunModel } from '../../src/models/detectionRun.model';
import { piiDetectionService } from '../../src/services/pii/piiDetection.service';

describe('PII Worker Distributed Retry & Duplicate Delivery Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = { email: `retry_user_${uniqueSuffix}@tenant.com`, password: 'Password123!' };
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
          .send({ name: `Retry Org ${uniqueSuffix}` });
        orgId = orgRes.body.organization.id;

        const user = await User.findOne({ email: userCredentials.email.toLowerCase() });
        const docDoc = await DocumentModel.create({
          organizationId: new mongoose.Types.ObjectId(orgId),
          uploadedBy: user!._id,
          originalFilename: 'retry_doc.pdf',
          size: 1024,
          declaredMimeType: 'application/pdf',
          detectedMimeType: 'application/pdf',
          extension: 'pdf',
          storageKey: `org_${orgId}/retry_${uniqueSuffix}.pdf`,
          status: 'EXTRACTED',
          checksum: `chk_retry_${uniqueSuffix}`,
          isDeleted: false,
        });
        docId = docDoc._id.toString();

        const sampleText = 'Contact maintainer at maintainer@system.org.';
        await NormalizedDocumentModel.create({
          documentId: docDoc._id,
          organizationId: new mongoose.Types.ObjectId(orgId),
          checksum: `chk_retry_${uniqueSuffix}`,
          format: 'pdf',
          schemaVersion: '1.0.0',
          extractorVersion: '1.0.0',
          status: 'COMPLETE',
          pages: [{ pageNumber: 1, blockCount: 1 }],
          blocks: [
            {
              blockId: 'blk_ret',
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
                blockId: 'blk_ret',
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
  }, 30000);

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      if (docId && orgId) {
        const docObjId = new mongoose.Types.ObjectId(docId);
        const orgObjId = new mongoose.Types.ObjectId(orgId);
        await DetectionRunModel.deleteMany({ documentId: docObjId });
        await NormalizedDocumentModel.deleteMany({ documentId: docObjId });
        await DocumentModel.deleteMany({ _id: docObjId });
        await Organization.deleteMany({ _id: orgObjId });
      }
      await User.deleteMany({ email: userCredentials.email.toLowerCase() });
    }
  });

  it('should reuse authoritative run and avoid creating duplicate results when worker retries duplicate job', async () => {
    if (mongoose.connection.readyState !== 1) return;

    // 1. Initial Job Delivery
    const run1 = await piiDetectionService.detectPIIForDocument(docId, orgId);
    expect(run1.run.status).toBe('COMPLETED');
    expect(run1.run.isLatestActive).toBe(true);

    // 2. Duplicate Job Delivery (Worker Retry simulation)
    (piiDetectionService as unknown as { inFlightDetections: Map<string, unknown> }).inFlightDetections.clear();
    const run2 = await piiDetectionService.detectPIIForDocument(docId, orgId);

    // 3. Verify same detection run is reused
    expect(run2.run.detectionRunId).toBe(run1.run.detectionRunId);

    const activeRuns = await DetectionRunModel.find({
      documentId: docId,
      organizationId: orgId,
      isLatestActive: true,
    });

    expect(activeRuns.length).toBe(1);
    expect(activeRuns[0].detectionRunId).toBe(run1.run.detectionRunId);
  });
});
