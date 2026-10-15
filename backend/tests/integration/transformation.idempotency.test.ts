import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { DetectionRunModel } from '../../src/models/detectionRun.model';
import { PIICandidateModel } from '../../src/models/piiCandidate.model';
import { DecisionRunModel } from '../../src/models/decisionRun.model';
import { DecisionResultModel } from '../../src/models/decisionResult.model';
import { TransformationRunModel } from '../../src/models/transformationRun.model';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';

describe('Transformation Idempotency Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = {
    email: `trans_idem_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'Trans',
    lastName: 'Idem',
  };
  let authToken: string;
  let orgId: string;
  let docId: string;
  let decRunId: string;
  let sampleFilePath: string;

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
      .send({ name: `Trans Idem Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `idem_doc_${uniqueSuffix}.txt`);
    await fs.promises.writeFile(sampleFilePath, 'Target SSN: 999-00-1111.', 'utf8');

    const user = await User.findOne({ normalizedEmail: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: 'idem_doc.txt',
      size: 512,
      declaredMimeType: 'text/plain',
      detectedMimeType: 'text/plain',
      extension: 'txt',
      storageKey: sampleFilePath,
      checksum: `chk_trans_idem_${uniqueSuffix}`,
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docId = docDoc._id.toString();

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

    const candDoc = await PIICandidateModel.create({
      candidateId: `cand_idem_${uniqueSuffix}`,
      detectionRunId: detRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      type: PIIType.US_SSN,
      category: PIICategory.GOVERNMENT_ID,
      severity: PIISeverity.HIGH,
      text: '999-00-1111',
      normalizedValue: '999001111',
      confidence: 0.99,
      detectorName: 'det_ssn',
      location: { startOffset: 12, endOffset: 23 },
      detectionScore: 0.99,
      sensitivityScore: 0.9,
      recognitionConfidence: 1.0,
      detectorType: 'DETERMINISTIC',
      detectorId: 'det_ssn',
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_1' },
    });

    decRunId = `dec_run_idem_${uniqueSuffix}`;
    await DecisionRunModel.create({
      decisionRunId: decRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      detectionRunId: detRunId,
      contextAnalysisRunId: `ctx_run_idem_${uniqueSuffix}`,
      policyId: 'pol_idem_1',
      policyVersion: 1,
      policyConfigurationHash: 'hash_pol_idem',
      status: 'COMPLETED',
      isLatestActive: true,
      totalCandidates: 1,
      redactCount: 1,
      keepCount: 0,
      reviewCount: 0,
      startedAt: new Date(),
      completedAt: new Date(),
    });

    await DecisionResultModel.create({
      decisionResultId: `dec_res_idem_${uniqueSuffix}`,
      decisionRunId: decRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      candidateId: candDoc.candidateId,
      detectionRunId: detRunId,
      contextAnalysisRunId: `ctx_run_idem_${uniqueSuffix}`,
      policyId: 'pol_idem_1',
      policyVersion: 1,
      decision: 'REDACT',
      decisionScore: 0.95,
      policyConfigurationHash: 'hash_pol_idem',
      evaluations: [],
      evaluatedAt: new Date(),
    });
  });

  afterAll(async () => {
    if (sampleFilePath && fs.existsSync(sampleFilePath)) {
      await fs.promises.unlink(sampleFilePath).catch(() => {});
    }
  });

  test('reuses existing completed transformation run on repeated requests', async () => {
    const res1 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/transformations`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'REDACTION' });

    expect(res1.status).toBe(200);
    const run1Id = res1.body.data.transformationRun.transformationRunId;

    const res2 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/transformations`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'REDACTION' });

    expect(res2.status).toBe(200);
    const run2Id = res2.body.data.transformationRun.transformationRunId;

    expect(run1Id).toBe(run2Id);
  });

  test('creates new transformation run when force=true is passed', async () => {
    const res1 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/transformations`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'REDACTION' });

    const run1Id = res1.body.data.transformationRun.transformationRunId;

    const res2 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/transformations`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'REDACTION', force: true });

    expect(res2.status).toBe(200);
    const run2Id = res2.body.data.transformationRun.transformationRunId;

    expect(run1Id).not.toBe(run2Id);

    // Check active flag transition
    const oldRun = await TransformationRunModel.findOne({ transformationRunId: run1Id });
    const newRun = await TransformationRunModel.findOne({ transformationRunId: run2Id });

    expect(oldRun?.isLatestActive).toBe(false);
    expect(newRun?.isLatestActive).toBe(true);
  });
});
