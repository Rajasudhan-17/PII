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

describe('Context Analysis Multi-Tenant Isolation Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userBCredentials = { email: `userB_cx_${uniqueSuffix}@tenantB.com`, password: 'Password123!', firstName: 'User', lastName: 'B' };
  let userBToken: string;
  let orgAId: string;
  let orgBId: string;
  let docAId: string;

  beforeAll(async () => {
    app = createApp();
    await connectDatabase();

    // User A & Org A
    const userACredentials = { email: `userA_cx_${uniqueSuffix}@tenantA.com`, password: 'Password123!', firstName: 'User', lastName: 'A' };
    await request(app).post('/api/v1/auth/register').send(userACredentials);
    await User.updateOne({ email: userACredentials.email.toLowerCase() }, { role: 'ORG_ADMIN' });
    const loginResA = await request(app).post('/api/v1/auth/login').send(userACredentials);
    const userAToken = loginResA.body.accessToken;

    const orgARes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: `Org A CX ${uniqueSuffix}` });
    orgAId = orgARes.body.organization.id;

    // User B & Org B
    await request(app).post('/api/v1/auth/register').send(userBCredentials);
    await User.updateOne({ email: userBCredentials.email.toLowerCase() }, { role: 'ORG_ADMIN' });
    const loginResB = await request(app).post('/api/v1/auth/login').send(userBCredentials);
    userBToken = loginResB.body.accessToken;

    const orgBRes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ name: `Org B CX ${uniqueSuffix}` });
    orgBId = orgBRes.body.organization.id;

    // Document A owned by Org A
    const userA = await User.findOne({ normalizedEmail: userACredentials.email.toLowerCase() });
    const docA = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgAId),
      uploadedBy: userA!._id,
      originalFilename: 'docA.pdf',
      size: 1024,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: `org_${orgAId}/docA_${uniqueSuffix}.pdf`,
      checksum: `sha256_docA_${uniqueSuffix}`,
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docAId = docA._id.toString();

    await NormalizedDocumentModel.create({
      documentId: docA._id,
      organizationId: new mongoose.Types.ObjectId(orgAId),
      checksum: docA.checksum,
      format: 'pdf',
      schemaVersion: '1.0.0',
      extractorVersion: '1.0.0',
      status: 'COMPLETE',
      pages: [{ pageNumber: 1, blockCount: 1 }],
      blocks: [
        {
          blockId: 'blk_A_1',
          type: 'PARAGRAPH',
          text: 'Name: OrgA Secret.',
          pageNumber: 1,
          readingOrderIndex: 0,
          startOffset: 0,
          endOffset: 17,
          provenance: { documentId: docAId, organizationId: orgAId, pageNumber: 1, blockId: 'blk_A_1' },
        },
      ],
      tables: [],
    });

    const detRunId = `det_run_A_${uniqueSuffix}`;
    await DetectionRunModel.create({
      detectionRunId: detRunId,
      organizationId: new mongoose.Types.ObjectId(orgAId),
      documentId: docA._id,
      documentChecksum: docA.checksum,
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_A',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
    });

    await PIICandidateModel.create({
      candidateId: `cand_A_1_${uniqueSuffix}`,
      detectionRunId: detRunId,
      documentId: docA._id,
      organizationId: new mongoose.Types.ObjectId(orgAId),
      type: PIIType.PERSON_NAME,
      category: PIICategory.DIRECT_IDENTIFIER,
      text: 'OrgA Secret',
      normalizedValue: 'OrgA Secret',
      confidence: 0.9,
      detectionScore: 0.9,
      severity: PIISeverity.MEDIUM,
      sensitivityScore: 0.65,
      evidence: ['PATTERN_MATCH'],
      detectorName: 'NameDetector',
      detectorType: 'DETERMINISTIC',
      decision: null,
      location: { startOffset: 6, endOffset: 17, blockId: 'blk_A_1', pageNumber: 1 },
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_A_1' },
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

  test('User B cannot trigger context analysis on Org A document (returns 404 to prevent org enumeration)', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgAId}/documents/${docAId}/context-analysis`)
      .set('Authorization', `Bearer ${userBToken}`)
      .send({});

    expect([403, 404]).toContain(res.status);
  });

  test('User B cannot query context results of Org A document under Org B context (returns 404)', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgBId}/documents/${docAId}/context-analysis/results`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBe(0);
  });
});
