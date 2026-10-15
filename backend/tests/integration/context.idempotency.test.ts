import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { DocumentModel } from '../../src/models/document.model';
import { NormalizedDocumentModel } from '../../src/models/normalizedDocument.model';
import { DetectionRunModel } from '../../src/models/detectionRun.model';
import { PIICandidateModel } from '../../src/models/piiCandidate.model';
import { ContextAnalysisRunModel } from '../../src/models/contextAnalysisRun.model';
import { ContextResultModel } from '../../src/models/contextResult.model';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';

describe('Context Analysis Idempotency Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = { email: `cx_idem_${uniqueSuffix}@tenant.com`, password: 'Password123!', firstName: 'Context', lastName: 'Idempotency' };
  let authToken: string;
  let orgId: string;
  let docId: string;

  beforeAll(async () => {
    app = createApp();
    await connectDatabase();

    await request(app).post('/api/v1/auth/register').send(userCredentials);
    await User.updateOne({ email: userCredentials.email.toLowerCase() }, { role: 'ORG_ADMIN' });

    const loginRes = await request(app).post('/api/v1/auth/login').send(userCredentials);
    authToken = loginRes.body.accessToken;

    const orgRes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: `CX Idem Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const user = await User.findOne({ email: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: 'idem_sample.pdf',
      size: 1024,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: `org_${orgId}/idem_${uniqueSuffix}.pdf`,
      status: 'EXTRACTED',
      checksum: `chk_idem_${uniqueSuffix}`,
      isDeleted: false,
    });
    docId = docDoc._id.toString();

    await NormalizedDocumentModel.create({
      documentId: docDoc._id,
      organizationId: new mongoose.Types.ObjectId(orgId),
      checksum: docDoc.checksum,
      format: 'pdf',
      schemaVersion: '1.0.0',
      extractorVersion: '1.0.0',
      status: 'COMPLETE',
      pages: [{ pageNumber: 1, blockCount: 1 }],
      blocks: [
        {
          blockId: 'blk_idem_1',
          type: 'PARAGRAPH',
          text: 'Name: John Smith. Email: john.smith@example.com.',
          pageNumber: 1,
          readingOrderIndex: 0,
          startOffset: 0,
          endOffset: 48,
          provenance: { documentId: docId, organizationId: orgId, pageNumber: 1, blockId: 'blk_idem_1' },
        },
      ],
      tables: [],
    });

    const detRunId = `det_run_idem_${uniqueSuffix}`;
    await DetectionRunModel.create({
      detectionRunId: detRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      documentChecksum: docDoc.checksum,
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_idem',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
    });

    await PIICandidateModel.create({
      candidateId: `cand_idem_1_${uniqueSuffix}`,
      detectionRunId: detRunId,
      documentId: docDoc._id,
      organizationId: new mongoose.Types.ObjectId(orgId),
      type: PIIType.EMAIL_ADDRESS,
      category: PIICategory.CONTACT_INFORMATION,
      text: 'john.smith@example.com',
      normalizedValue: 'john.smith@example.com',
      confidence: 0.98,
      detectionScore: 0.98,
      severity: PIISeverity.MEDIUM,
      sensitivityScore: 0.75,
      evidence: ['REGEX_MATCH'],
      detectorName: 'EmailDetector',
      detectorType: 'DETERMINISTIC',
      decision: null,
      location: { startOffset: 25, endOffset: 47, blockId: 'blk_idem_1', pageNumber: 1 },
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_idem_1' },
    });
  }, 30000);

  afterAll(async () => {
    await ContextResultModel.deleteMany({});
    await ContextAnalysisRunModel.deleteMany({});
    await PIICandidateModel.deleteMany({});
    await DetectionRunModel.deleteMany({});
    await NormalizedDocumentModel.deleteMany({});
    await DocumentModel.deleteMany({});
    await Organization.deleteMany({});
    await User.deleteMany({});
  });

  test('should reuse existing completed run on consecutive triggers without duplicating records', async () => {
    const res1 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/context-analysis`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res1.status).toBe(200);
    const runId1 = res1.body.data.contextAnalysisRunId;

    const res2 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/context-analysis`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res2.status).toBe(200);
    const runId2 = res2.body.data.contextAnalysisRunId;

    expect(runId2).toBe(runId1); // Idempotent reuse!
  });
});
