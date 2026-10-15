import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';

describe('Verification Routes Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = {
    email: `ver_routes_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'Ver',
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
      .send({ name: `Ver Routes Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `ver_routes_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Author (John Smith) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const realChecksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const user = await User.findOne({ normalizedEmail: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: `Ver_Doc_${uniqueSuffix}.pdf`,
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

  test('POST /verification returns 401 unauthorized if no token is provided', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/verification`)
      .send({});

    expect(res.status).toBe(401);
  });

  test('POST /verification executes verification synchronously', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/verification`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verificationRun).toBeDefined();
    expect(res.body.data.verificationRun.status).toBe('COMPLETED');
    expect(Array.isArray(res.body.data.results)).toBe(true);
  });

  test('POST /verification?async=true enqueues job and returns 202 Accepted', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/verification?async=true`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('VERIFICATION_QUEUED');
  });

  test('GET /verification/runs lists executed verification runs', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/verification/runs`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.verificationRuns)).toBe(true);
  });

  test('GET /verification/results queries active verification run and results', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/verification/results`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verificationRun.isLatestActive).toBe(true);
  });
});
