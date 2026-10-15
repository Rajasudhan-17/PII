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

describe('Policy & Decision Integration Routes Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = {
    email: `pol_route_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'Policy',
    lastName: 'Admin',
  };
  let authToken: string;
  let orgId: string;
  let docId: string;
  let createdPolicyId: string;

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
      .send({ name: `Policy Routes Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const user = await User.findOne({ normalizedEmail: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: 'policy_sample.pdf',
      size: 1024,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: `org_${orgId}/pol_${uniqueSuffix}.pdf`,
      checksum: `chk_pol_${uniqueSuffix}`,
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
          blockId: 'blk_pol_1',
          type: 'PARAGRAPH',
          text: 'Name: Jane. Email: jane@example.com.',
          pageNumber: 1,
          readingOrderIndex: 0,
          startOffset: 0,
          endOffset: 36,
          provenance: { documentId: docId, organizationId: orgId, pageNumber: 1, blockId: 'blk_pol_1' },
        },
      ],
      tables: [],
    });

    const detRunId = `det_run_pol_${uniqueSuffix}`;
    await DetectionRunModel.create({
      detectionRunId: detRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      documentChecksum: docDoc.checksum,
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_pol',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
    });

    const candId = `cand_pol_1_${uniqueSuffix}`;
    await PIICandidateModel.create({
      candidateId: candId,
      detectionRunId: detRunId,
      documentId: docDoc._id,
      organizationId: new mongoose.Types.ObjectId(orgId),
      type: PIIType.EMAIL_ADDRESS,
      category: PIICategory.CONTACT_INFORMATION,
      text: 'jane@example.com',
      normalizedValue: 'jane@example.com',
      confidence: 0.98,
      detectionScore: 0.98,
      severity: PIISeverity.MEDIUM,
      sensitivityScore: 0.75,
      evidence: ['REGEX_MATCH'],
      detectorName: 'EmailDetector',
      detectorType: 'DETERMINISTIC',
      decision: null,
      location: { startOffset: 19, endOffset: 35, blockId: 'blk_pol_1', pageNumber: 1 },
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_pol_1' },
    });

    const cxRunId = `cx_run_pol_${uniqueSuffix}`;
    await ContextAnalysisRunModel.create({
      contextAnalysisRunId: cxRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      detectionRunId: detRunId,
      documentChecksum: docDoc.checksum,
      normalizedDocumentVersion: '1.0.0',
      contextConfigurationVersion: '1.0.0',
      contextConfigurationHash: 'hash_cx_pol',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
      processedCount: 1,
    });

    await ContextResultModel.create({
      contextResultId: `cx_res_pol_${uniqueSuffix}`,
      contextAnalysisRunId: cxRunId,
      candidateId: candId,
      documentId: docDoc._id,
      organizationId: new mongoose.Types.ObjectId(orgId),
      contextWindow: { type: 'PARAGRAPH', textLength: 36, startOffset: 0, endOffset: 36, blockId: 'blk_pol_1' },
      semanticRole: 'CONTACT_FIELD',
      fieldLabel: 'Email',
      nearbyKeywords: ['Email'],
      structuralContext: { isTable: false, isHeaderFooter: false, isForm: false },
      contextualScore: 0.85,
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

  test('POST /policies should create a new published tenant policy', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/policies`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Financial & Contact Protection',
        description: 'Redacts high confidence contact PII',
        defaultDecision: 'REVIEW',
        rules: [
          {
            ruleId: 'r_redact_email',
            name: 'Redact Email',
            priority: 10,
            action: 'REDACT',
            conditions: [{ property: 'type', operator: 'EQUALS', value: 'EMAIL_ADDRESS' }],
            rationaleCode: 'RULE_REDACT_EMAIL',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.policy.policyId).toBeDefined();
    createdPolicyId = res.body.data.policy.policyId;
  });

  test('GET /policies should return list of tenant policies', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/policies`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.policies.length).toBeGreaterThan(0);
  });

  test('POST /policies/:policyId/versions should publish a new policy version', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/policies/${createdPolicyId}/versions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        rules: [
          {
            ruleId: 'r_redact_email_v2',
            name: 'Redact Email v2',
            priority: 20,
            action: 'REDACT',
            conditions: [{ property: 'type', operator: 'EQUALS', value: 'EMAIL_ADDRESS' }],
            rationaleCode: 'RULE_REDACT_EMAIL_V2',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.policy.version).toBe(2);
  });

  test('POST /decision-evaluation should evaluate document decisions and return results', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/decision-evaluation`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ policyId: createdPolicyId });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.resultsCount).toBe(1);
    expect(res.body.data.decisionsSummary.REDACT).toBe(1);
  });

  test('GET /decisions should return active decision results with decision score and rationale', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/decisions`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBe(1);
    expect(res.body.data.results[0].decision).toBe('REDACT');
    expect(res.body.data.results[0].decisionScore).toBeDefined();
  });
});
