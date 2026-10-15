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
import { PolicyModel } from '../../src/models/policy.model';
import { DecisionRunModel } from '../../src/models/decisionRun.model';
import { DecisionResultModel } from '../../src/models/decisionResult.model';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';

describe('Decision Evaluation Idempotency Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = {
    email: `dec_idem_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'Decision',
    lastName: 'Idempotency',
  };
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
      .send({ name: `Dec Idem Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const user = await User.findOne({ normalizedEmail: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: 'idem_sample.pdf',
      size: 1024,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: `org_${orgId}/idem_${uniqueSuffix}.pdf`,
      checksum: `chk_dec_idem_${uniqueSuffix}`,
      status: 'EXTRACTED',
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
          text: 'Name: Alice.',
          pageNumber: 1,
          readingOrderIndex: 0,
          startOffset: 0,
          endOffset: 12,
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

    const candId = `cand_idem_1_${uniqueSuffix}`;
    await PIICandidateModel.create({
      candidateId: candId,
      detectionRunId: detRunId,
      documentId: docDoc._id,
      organizationId: new mongoose.Types.ObjectId(orgId),
      type: PIIType.PERSON_NAME,
      category: PIICategory.DIRECT_IDENTIFIER,
      text: 'Alice',
      normalizedValue: 'Alice',
      confidence: 0.9,
      detectionScore: 0.9,
      severity: PIISeverity.MEDIUM,
      sensitivityScore: 0.65,
      evidence: ['PATTERN_MATCH'],
      detectorName: 'NameDetector',
      detectorType: 'DETERMINISTIC',
      decision: null,
      location: { startOffset: 6, endOffset: 11, blockId: 'blk_idem_1', pageNumber: 1 },
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_idem_1' },
    });

    const cxRunId = `cx_run_idem_${uniqueSuffix}`;
    await ContextAnalysisRunModel.create({
      contextAnalysisRunId: cxRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      detectionRunId: detRunId,
      documentChecksum: docDoc.checksum,
      normalizedDocumentVersion: '1.0.0',
      contextConfigurationVersion: '1.0.0',
      contextConfigurationHash: 'hash_cx_idem',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
      processedCount: 1,
    });

    await ContextResultModel.create({
      contextResultId: `cx_res_idem_${uniqueSuffix}`,
      contextAnalysisRunId: cxRunId,
      candidateId: candId,
      documentId: docDoc._id,
      organizationId: new mongoose.Types.ObjectId(orgId),
      contextWindow: { type: 'PARAGRAPH', textLength: 12, startOffset: 0, endOffset: 12, blockId: 'blk_idem_1' },
      semanticRole: 'PERSON_NAME',
      fieldLabel: 'Name',
      nearbyKeywords: ['Name'],
      structuralContext: { isTable: false, isHeaderFooter: false, isForm: false },
      contextualScore: 0.8,
      ambiguityIndicators: [],
      language: 'en',
      script: 'Latin',
      analyzerVersion: '1.0.0',
      decision: null,
    });
  }, 30000);

  afterAll(async () => {
    await DecisionResultModel.deleteMany({});
    await DecisionRunModel.deleteMany({});
    await PolicyModel.deleteMany({});
    await ContextResultModel.deleteMany({});
    await ContextAnalysisRunModel.deleteMany({});
    await PIICandidateModel.deleteMany({});
    await DetectionRunModel.deleteMany({});
    await NormalizedDocumentModel.deleteMany({});
    await DocumentModel.deleteMany({});
    await Organization.deleteMany({});
    await User.deleteMany({});
  });

  test('should reuse existing completed decision run on consecutive requests', async () => {
    const res1 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/decision-evaluation`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res1.status).toBe(200);
    const runId1 = res1.body.data.decisionRunId;

    const res2 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/decision-evaluation`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res2.status).toBe(200);
    const runId2 = res2.body.data.decisionRunId;

    expect(runId2).toBe(runId1); // Idempotent reuse!
  });
});
