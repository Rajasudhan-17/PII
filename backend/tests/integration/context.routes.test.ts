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

describe('Context Analysis Integration Routes Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = { email: `cx_route_${uniqueSuffix}@tenant.com`, password: 'Password123!', firstName: 'Context', lastName: 'Tester' };
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
      .send({ name: `CX Routes Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const user = await User.findOne({ email: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: 'context_sample.pdf',
      size: 1024,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: `org_${orgId}/context_${uniqueSuffix}.pdf`,
      status: 'EXTRACTED',
      checksum: `chk_cx_${uniqueSuffix}`,
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
          blockId: 'blk_cx_1',
          type: 'PARAGRAPH',
          text: 'Customer Full Name: Jane Doe. Email Address: jane.doe@example.com.',
          pageNumber: 1,
          readingOrderIndex: 0,
          startOffset: 0,
          endOffset: 67,
          provenance: {
            documentId: docId,
            organizationId: orgId,
            pageNumber: 1,
            blockId: 'blk_cx_1',
          },
        },
      ],
      tables: [],
    });

    const detRunId = `det_run_cx_${uniqueSuffix}`;
    await DetectionRunModel.create({
      detectionRunId: detRunId,
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: docDoc._id,
      documentChecksum: docDoc.checksum,
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_cx',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 2,
    });

    await PIICandidateModel.create([
      {
        candidateId: `cand_cx_1_${uniqueSuffix}`,
        detectionRunId: detRunId,
        documentId: docDoc._id,
        organizationId: new mongoose.Types.ObjectId(orgId),
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: 'Jane Doe',
        normalizedValue: 'Jane Doe',
        confidence: 0.95,
        detectionScore: 0.95,
        severity: PIISeverity.MEDIUM,
        sensitivityScore: 0.65,
        evidence: ['PATTERN_MATCH'],
        detectorName: 'NameDetector',
        detectorType: 'DETERMINISTIC',
        decision: null,
        location: { startOffset: 20, endOffset: 28, blockId: 'blk_cx_1', pageNumber: 1 },
        provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_cx_1' },
      },
      {
        candidateId: `cand_cx_2_${uniqueSuffix}`,
        detectionRunId: detRunId,
        documentId: docDoc._id,
        organizationId: new mongoose.Types.ObjectId(orgId),
        type: PIIType.EMAIL_ADDRESS,
        category: PIICategory.CONTACT_INFORMATION,
        text: 'jane.doe@example.com',
        normalizedValue: 'jane.doe@example.com',
        confidence: 0.98,
        detectionScore: 0.98,
        severity: PIISeverity.MEDIUM,
        sensitivityScore: 0.75,
        evidence: ['REGEX_MATCH'],
        detectorName: 'EmailDetector',
        detectorType: 'DETERMINISTIC',
        decision: null,
        location: { startOffset: 45, endOffset: 65, blockId: 'blk_cx_1', pageNumber: 1 },
        provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_cx_1' },
      },
    ]);
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

  test('POST /context-analysis should trigger context analysis and generate results', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/context-analysis`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.resultsCount).toBe(2);
  });

  test('GET /context-analysis/runs should return list of context analysis runs', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/context-analysis/runs`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.runs.length).toBeGreaterThan(0);
  });

  test('GET /context-analysis/results should return context results with decision === null', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/context-analysis/results`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBe(2);
    for (const item of res.body.data.results) {
      expect(item.decision).toBeNull();
      expect(item.contextualScore).toBeDefined();
    }
  });

  test('GET /context-analysis/summary should return contextual summary breakdown', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/context-analysis/summary`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalResults).toBe(2);
    expect(res.body.data.bySemanticRole).toBeDefined();
  });
});
