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
import { TransformationRecordModel } from '../../src/models/transformationRecord.model';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';

describe('Transformation Adversarial Safety Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userA = {
    email: `adv_trans_a_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'AdvA',
    lastName: 'User',
  };
  const userB = {
    email: `adv_trans_b_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'AdvB',
    lastName: 'User',
  };
  let tokenA: string;
  let tokenB: string;
  let orgAId: string;
  let orgBId: string;
  let docAId: string;
  let sampleFilePath: string;

  beforeAll(async () => {
    app = createApp();
    await connectDatabase();

    // Register User A & Org A
    await request(app).post('/api/v1/auth/register').send(userA);
    await User.updateOne({ email: userA.email.toLowerCase() }, { role: 'ORG_ADMIN' });
    const loginA = await request(app).post('/api/v1/auth/login').send(userA);
    tokenA = loginA.body.accessToken;

    const orgARes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `Adv Trans Org A ${uniqueSuffix}` });
    orgAId = orgARes.body.organization.id;

    // Register User B & Org B
    await request(app).post('/api/v1/auth/register').send(userB);
    await User.updateOne({ email: userB.email.toLowerCase() }, { role: 'ORG_ADMIN' });
    const loginB = await request(app).post('/api/v1/auth/login').send(userB);
    tokenB = loginB.body.accessToken;

    const orgBRes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: `Adv Trans Org B ${uniqueSuffix}` });
    orgBId = orgBRes.body.organization.id;

    // Sample source file containing sensitive credentials
    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `adv_doc_${uniqueSuffix}.txt`);
    await fs.promises.writeFile(
      sampleFilePath,
      'API Key: sk-live-super-secret-key-123456789. Bearer Token: bearer-987654321.',
      'utf8'
    );

    const userObj = await User.findOne({ normalizedEmail: userA.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgAId),
      uploadedBy: userObj!._id,
      originalFilename: 'adv_credentials.txt',
      size: 512,
      declaredMimeType: 'text/plain',
      detectedMimeType: 'text/plain',
      extension: 'txt',
      storageKey: sampleFilePath,
      checksum: `chk_adv_trans_${uniqueSuffix}`,
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docAId = docDoc._id.toString();

    const detRunId = `det_run_adv_${uniqueSuffix}`;
    await DetectionRunModel.create({
      detectionRunId: detRunId,
      organizationId: new mongoose.Types.ObjectId(orgAId),
      documentId: docDoc._id,
      documentChecksum: docDoc.checksum,
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_adv',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
    });

    const candDoc = await PIICandidateModel.create({
      candidateId: `cand_adv_${uniqueSuffix}`,
      detectionRunId: detRunId,
      organizationId: new mongoose.Types.ObjectId(orgAId),
      documentId: docDoc._id,
      type: PIIType.AUTH_TOKEN_KEY,
      category: PIICategory.SECURITY_CREDENTIAL,
      severity: PIISeverity.CRITICAL,
      text: 'bearer-987654321',
      normalizedValue: 'bearer-987654321',
      confidence: 0.99,
      detectorName: 'det_cred',
      location: { startOffset: 62, endOffset: 78 },
      detectionScore: 0.99,
      sensitivityScore: 1.0,
      recognitionConfidence: 1.0,
      detectorType: 'DETERMINISTIC',
      detectorId: 'det_cred',
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_1' },
    });

    const decRunId = `dec_run_adv_${uniqueSuffix}`;
    await DecisionRunModel.create({
      decisionRunId: decRunId,
      organizationId: new mongoose.Types.ObjectId(orgAId),
      documentId: docDoc._id,
      detectionRunId: detRunId,
      contextAnalysisRunId: `ctx_run_adv_${uniqueSuffix}`,
      policyId: 'pol_adv_1',
      policyVersion: 1,
      policyConfigurationHash: 'hash_pol_adv',
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
      decisionResultId: `dec_res_adv_${uniqueSuffix}`,
      decisionRunId: decRunId,
      organizationId: new mongoose.Types.ObjectId(orgAId),
      documentId: docDoc._id,
      candidateId: candDoc.candidateId,
      detectionRunId: detRunId,
      contextAnalysisRunId: `ctx_run_adv_${uniqueSuffix}`,
      policyId: 'pol_adv_1',
      policyVersion: 1,
      decision: 'REDACT',
      decisionScore: 0.95,
      policyConfigurationHash: 'hash_pol_adv',
      evaluations: [],
      evaluatedAt: new Date(),
    });
  });

  afterAll(async () => {
    if (sampleFilePath && fs.existsSync(sampleFilePath)) {
      await fs.promises.unlink(sampleFilePath).catch(() => {});
    }
  });

  test('Cross-tenant isolation: Org B user cannot access Org A document transformations', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgAId}/documents/${docAId}/transformations`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ operation: 'REDACTION' });

    expect([403, 404]).toContain(res.status);

    const resB = await request(app)
      .post(`/api/v1/organizations/${orgBId}/documents/${docAId}/transformations`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ operation: 'REDACTION' });

    expect([403, 404]).toContain(resB.status);
  });

  test('Credential mutation safety: MUTATION request on AUTH_TOKEN_KEY forces [REDACTED_CREDENTIAL]', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgAId}/documents/${docAId}/transformations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ operation: 'MUTATION', force: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const transRunId = res.body.data.transformationRun.transformationRunId;
    const record = await TransformationRecordModel.findOne({
      transformationRunId: transRunId,
    });

    expect(record).toBeDefined();
    expect(record?.syntheticValue).toBe('[REDACTED_CREDENTIAL]');
  });
});
