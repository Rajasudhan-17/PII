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

describe('Transformation Concurrency Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = {
    email: `trans_conc_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'Trans',
    lastName: 'Conc',
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
      .send({ name: `Trans Conc Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `conc_doc_${uniqueSuffix}.txt`);
    await fs.promises.writeFile(sampleFilePath, 'Parallel run test for user Jane Doe.', 'utf8');

    const user = await User.findOne({ normalizedEmail: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: 'conc_doc.txt',
      size: 512,
      declaredMimeType: 'text/plain',
      detectedMimeType: 'text/plain',
      extension: 'txt',
      storageKey: sampleFilePath,
      checksum: `chk_trans_conc_${uniqueSuffix}`,
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docId = docDoc._id.toString();

    const detRunId = `det_run_conc_${uniqueSuffix}`;
    await DetectionRunModel.create({
      detectionRunId: detRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      documentChecksum: docDoc.checksum,
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_conc',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
    });

    const candDoc = await PIICandidateModel.create({
      candidateId: `cand_conc_${uniqueSuffix}`,
      detectionRunId: detRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      type: PIIType.PERSON_NAME,
      category: PIICategory.DIRECT_IDENTIFIER,
      severity: PIISeverity.HIGH,
      text: 'Jane Doe',
      normalizedValue: 'jane doe',
      confidence: 0.95,
      detectorName: 'det_name',
      location: { startOffset: 27, endOffset: 35 },
      detectionScore: 0.95,
      sensitivityScore: 0.8,
      recognitionConfidence: 0.99,
      detectorType: 'DETERMINISTIC',
      detectorId: 'det_name',
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_1' },
    });

    decRunId = `dec_run_conc_${uniqueSuffix}`;
    await DecisionRunModel.create({
      decisionRunId: decRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      detectionRunId: detRunId,
      contextAnalysisRunId: `ctx_run_conc_${uniqueSuffix}`,
      policyId: 'pol_conc_1',
      policyVersion: 1,
      policyConfigurationHash: 'hash_pol_conc',
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
      decisionResultId: `dec_res_conc_${uniqueSuffix}`,
      decisionRunId: decRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      candidateId: candDoc.candidateId,
      detectionRunId: detRunId,
      contextAnalysisRunId: `ctx_run_conc_${uniqueSuffix}`,
      policyId: 'pol_conc_1',
      policyVersion: 1,
      decision: 'REDACT',
      decisionScore: 0.95,
      policyConfigurationHash: 'hash_pol_conc',
      evaluations: [],
      evaluatedAt: new Date(),
    });
  });

  afterAll(async () => {
    if (sampleFilePath && fs.existsSync(sampleFilePath)) {
      await fs.promises.unlink(sampleFilePath).catch(() => {});
    }
  });

  test('simultaneous parallel requests deduplicate cleanly and enforce single active run invariant', async () => {
    const promises = Array.from({ length: 5 }).map(() =>
      request(app)
        .post(`/api/v1/organizations/${orgId}/documents/${docId}/transformations`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ operation: 'REDACTION' })
    );

    const results = await Promise.all(promises);

    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }

    const activeRuns = await TransformationRunModel.find({
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: new mongoose.Types.ObjectId(docId),
      isLatestActive: true,
    });

    expect(activeRuns.length).toBe(1);
  });
});
