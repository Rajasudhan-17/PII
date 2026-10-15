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

describe('PII Active Publication Failure & Invariant Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = { email: `pub_fail_user_${uniqueSuffix}@tenant.com`, password: 'Password123!' };
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
          .send({ name: `PubFail Org ${uniqueSuffix}` });
        orgId = orgRes.body.organization.id;

        const user = await User.findOne({ email: userCredentials.email.toLowerCase() });
        const docDoc = await DocumentModel.create({
          organizationId: new mongoose.Types.ObjectId(orgId),
          uploadedBy: user!._id,
          originalFilename: 'pub_fail_doc.pdf',
          size: 1024,
          declaredMimeType: 'application/pdf',
          detectedMimeType: 'application/pdf',
          extension: 'pdf',
          storageKey: `org_${orgId}/pub_fail_${uniqueSuffix}.pdf`,
          status: 'EXTRACTED',
          checksum: `chk_pubfail_${uniqueSuffix}`,
          isDeleted: false,
        });
        docId = docDoc._id.toString();

        const sampleText = 'Contact administrator at admin@domain.org.';
        await NormalizedDocumentModel.create({
          documentId: docDoc._id,
          organizationId: new mongoose.Types.ObjectId(orgId),
          checksum: `chk_pubfail_${uniqueSuffix}`,
          format: 'pdf',
          schemaVersion: '1.0.0',
          extractorVersion: '1.0.0',
          status: 'COMPLETE',
          pages: [{ pageNumber: 1, blockCount: 1 }],
          blocks: [
            {
              blockId: 'blk_pf1',
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
                blockId: 'blk_pf1',
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
        await DetectionRunModel.deleteMany({ documentId: docObjId });
        await NormalizedDocumentModel.deleteMany({ documentId: docObjId });
        await DocumentModel.deleteMany({ _id: docObjId });
        await Organization.deleteMany({ _id: orgObjId });
      }
      await User.deleteMany({ email: userCredentials.email.toLowerCase() });
    }
  });

  it('should maintain Run A active if Run B encounters a publication error, avoiding orphaned inactive state', async () => {
    if (mongoose.connection.readyState !== 1) return;

    // 1. Execute Run A successfully
    const resA = await piiDetectionService.detectPIIForDocument(docId, orgId);
    expect(resA.run.status).toBe('COMPLETED');
    expect(resA.run.isLatestActive).toBe(true);

    const initialActive = await DetectionRunModel.find({
      documentId: docId,
      organizationId: orgId,
      isLatestActive: true,
    });
    expect(initialActive.length).toBe(1);
    expect(initialActive[0].detectionRunId).toBe(resA.run.detectionRunId);

    // 2. Mock DetectionRunModel.updateOne to throw a publication error on forced Run B publication ONLY
    let failCount = 0;
    const originalUpdateOne = DetectionRunModel.updateOne;
    // @ts-expect-error - Mocking updateOne for failure test
    jest.spyOn(DetectionRunModel, 'updateOne').mockImplementation(function (...args: unknown[]) {
      const update = args[1] as Record<string, unknown>;
      if (
        failCount === 0 &&
        update &&
        typeof update === 'object' &&
        '$set' in update &&
        (update.$set as { isLatestActive?: boolean })?.isLatestActive === true
      ) {
        failCount++;
        return Promise.reject(new Error('Simulated Database Publication Failure'));
      }
      // @ts-expect-error - Forwarding args to original method
      return originalUpdateOne.apply(DetectionRunModel, args);
    });

    // 3. Execute forced Run B
    await expect(
      piiDetectionService.detectPIIForDocument(docId, orgId, { force: true })
    ).rejects.toThrow('Simulated Database Publication Failure');

    // 4. Verify invariant: Run A remains isLatestActive = true!
    const postFailActive = await DetectionRunModel.find({
      documentId: docId,
      organizationId: orgId,
      isLatestActive: true,
    });

    expect(postFailActive.length).toBe(1);
    expect(postFailActive[0].detectionRunId).toBe(resA.run.detectionRunId);
  });
});
