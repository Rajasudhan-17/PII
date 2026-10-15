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

describe('Policy & Decision Multi-Tenant Isolation Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userBCredentials = {
    email: `userB_pol_${uniqueSuffix}@tenantB.com`,
    password: 'Password123!',
    firstName: 'User',
    lastName: 'B',
  };
  let userBToken: string;
  let orgAId: string;
  let orgBId: string;
  let docAId: string;

  beforeAll(async () => {
    app = createApp();
    await connectDatabase();

    // User A & Org A
    const userACredentials = {
      email: `userA_pol_${uniqueSuffix}@tenantA.com`,
      password: 'Password123!',
      firstName: 'User',
      lastName: 'A',
    };
    await request(app).post('/api/v1/auth/register').send(userACredentials);
    await User.updateOne({ email: userACredentials.email.toLowerCase() }, { role: 'ORG_ADMIN' });
    const loginResA = await request(app).post('/api/v1/auth/login').send(userACredentials);
    const userAToken = loginResA.body.accessToken;

    const orgARes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: `Org A Policy ${uniqueSuffix}` });
    orgAId = orgARes.body.organization.id;

    // User B & Org B
    await request(app).post('/api/v1/auth/register').send(userBCredentials);
    await User.updateOne({ email: userBCredentials.email.toLowerCase() }, { role: 'ORG_ADMIN' });
    const loginResB = await request(app).post('/api/v1/auth/login').send(userBCredentials);
    userBToken = loginResB.body.accessToken;

    const orgBRes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ name: `Org B Policy ${uniqueSuffix}` });
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
      checksum: `sha256_docA_pol_${uniqueSuffix}`,
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docAId = docA._id.toString();
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

  test('User B cannot list policies of Org A (returns 403 / 404 anti-enumeration)', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgAId}/policies`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect([403, 404]).toContain(res.status);
  });

  test('User B cannot trigger decision evaluation on Org A document (returns 403 / 404)', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgAId}/documents/${docAId}/decision-evaluation`)
      .set('Authorization', `Bearer ${userBToken}`)
      .send({});

    expect([403, 404]).toContain(res.status);
  });

  test('User B querying decisions of Org A document under Org B context returns empty list', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgBId}/documents/${docAId}/decisions`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBe(0);
  });
});
