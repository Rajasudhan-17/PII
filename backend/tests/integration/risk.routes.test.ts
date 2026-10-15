import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';

describe('Re-Identification Risk Routes Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = {
    email: `risk_routes_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'Risk',
    lastName: 'Routes',
  };
  let authToken: string;
  let orgId: string;
  let docId: string;
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
      .send({ name: `Risk Routes Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `risk_routes_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Author (John Smith) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const realChecksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const user = await User.findOne({ normalizedEmail: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: `Risk_Doc_${uniqueSuffix}.pdf`,
      size: 512,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: sampleFilePath,
      checksum: realChecksum,
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docId = docDoc._id.toString();
  });

  afterAll(async () => {
    if (sampleFilePath && fs.existsSync(sampleFilePath)) {
      await fs.promises.unlink(sampleFilePath).catch(() => {});
    }
  });

  test('POST /risk-analysis returns 401 unauthorized if no token is provided', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/risk-analysis`)
      .send({});

    expect(res.status).toBe(401);
  });

  test('POST /risk-analysis executes re-identification risk analysis synchronously', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/risk-analysis`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.riskRun).toBeDefined();
    expect(res.body.data.riskRun.status).toBe('COMPLETED');
    expect(res.body.data.riskRun.reidentificationRiskScore).toBeDefined();
    expect(res.body.data.riskRun.riskLevel).toBeDefined();
    expect(Array.isArray(res.body.data.results)).toBe(true);
  });

  test('POST /risk-analysis?async=true enqueues job and returns 202 Accepted', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/risk-analysis?async=true`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('RISK_ANALYSIS_QUEUED');
    expect(res.body.data.jobId).toBeDefined();
  });

  test('GET /risk-analysis/runs lists executed risk evaluation runs', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/risk-analysis/runs`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.riskRuns)).toBe(true);
    expect(res.body.data.riskRuns.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /risk-analysis/results queries active risk evaluation run and detailed results', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/risk-analysis/results`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.riskRun.isLatestActive).toBe(true);
    expect(Array.isArray(res.body.data.results)).toBe(true);
  });
});
