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
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';

describe('Transformation Routes Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = {
    email: `trans_routes_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'Trans',
    lastName: 'Routes',
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
      .send({ name: `Trans Routes Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    // Create a real physical file for source storage
    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `routes_doc_${uniqueSuffix}.txt`);
    await fs.promises.writeFile(sampleFilePath, 'Hello Alice Doe, SSN is 000-11-2222.', 'utf8');

    const user = await User.findOne({ normalizedEmail: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: 'sample_routes.txt',
      size: 1024,
      declaredMimeType: 'text/plain',
      detectedMimeType: 'text/plain',
      extension: 'txt',
      storageKey: sampleFilePath,
      checksum: `chk_trans_routes_${uniqueSuffix}`,
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docId = docDoc._id.toString();

    const detRunId = `det_run_routes_${uniqueSuffix}`;
    await DetectionRunModel.create({
      detectionRunId: detRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      documentChecksum: docDoc.checksum,
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_routes',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
    });

    const candDoc = await PIICandidateModel.create({
      candidateId: `cand_routes_${uniqueSuffix}`,
      detectionRunId: detRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      type: PIIType.PERSON_NAME,
      category: PIICategory.DIRECT_IDENTIFIER,
      severity: PIISeverity.HIGH,
      text: 'Alice Doe',
      normalizedValue: 'alice doe',
      confidence: 0.95,
      detectorName: 'det_name',
      location: { startOffset: 6, endOffset: 15 },
      detectionScore: 0.95,
      sensitivityScore: 0.8,
      recognitionConfidence: 0.99,
      detectorType: 'DETERMINISTIC',
      detectorId: 'det_name',
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_1' },
    });

    decRunId = `dec_run_routes_${uniqueSuffix}`;
    await DecisionRunModel.create({
      decisionRunId: decRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      detectionRunId: detRunId,
      contextAnalysisRunId: `ctx_run_routes_${uniqueSuffix}`,
      policyId: 'pol_routes_1',
      policyVersion: 1,
      policyConfigurationHash: 'hash_pol_routes',
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
      decisionResultId: `dec_res_routes_${uniqueSuffix}`,
      decisionRunId: decRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      candidateId: candDoc.candidateId,
      detectionRunId: detRunId,
      contextAnalysisRunId: `ctx_run_routes_${uniqueSuffix}`,
      policyId: 'pol_routes_1',
      policyVersion: 1,
      decision: 'REDACT',
      decisionScore: 0.95,
      policyConfigurationHash: 'hash_pol_routes',
      evaluations: [],
      evaluatedAt: new Date(),
    });
  });

  afterAll(async () => {
    if (sampleFilePath && fs.existsSync(sampleFilePath)) {
      await fs.promises.unlink(sampleFilePath).catch(() => {});
    }
  });

  test('POST /transformations returns 401 unauthorized if no token is provided', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/transformations`)
      .send({ operation: 'REDACTION' });

    expect(res.status).toBe(401);
  });

  test('POST /transformations executes REDACTION and creates output artifact & records', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/transformations`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'REDACTION' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transformationRun).toBeDefined();
    expect(res.body.data.transformationRun.status).toBe('COMPLETED');
    expect(res.body.data.transformationRun.operation).toBe('REDACTION');
    expect(res.body.data.outputArtifact).toBeDefined();
    expect(res.body.data.records.length).toBeGreaterThan(0);
  });

  test('POST /transformations executes MUTATION', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/transformations`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'MUTATION', force: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transformationRun.operation).toBe('MUTATION');
  });

  test('GET /transformations lists executed transformation runs', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/transformations`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.transformationRuns)).toBe(true);
    expect(res.body.data.transformationRuns.length).toBeGreaterThanOrEqual(2);
  });

  test('GET /transformations/artifacts gets active transformed output artifact', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/transformations/artifacts`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transformationRun.isLatestActive).toBe(true);
    expect(res.body.data.outputArtifact).toBeDefined();
  });
});
