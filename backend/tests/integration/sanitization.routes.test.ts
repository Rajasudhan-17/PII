import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';

describe('Sanitization Routes Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = {
    email: `sanit_routes_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'Sanit',
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
      .send({ name: `Sanit Routes Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `sanit_routes_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Author (John Smith) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const realChecksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const user = await User.findOne({ normalizedEmail: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: `John_Smith_Passport_${uniqueSuffix}.pdf`,
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

  test('POST /sanitization returns 401 unauthorized if no token is provided', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization`)
      .send({ operation: 'FULL_CLEAN' });

    expect(res.status).toBe(401);
  });

  test('POST /sanitization executes metadata sanitization and creates output artifact & records', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'FULL_CLEAN' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sanitizationRun).toBeDefined();
    expect(res.body.data.sanitizationRun.status).toBe('COMPLETED');
    expect(res.body.data.outputArtifact).toBeDefined();
    expect(res.body.data.records.length).toBeGreaterThan(0);
  });

  test('GET /sanitization/runs lists executed sanitization runs', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization/runs`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.sanitizationRuns)).toBe(true);
    expect(res.body.data.sanitizationRuns.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /sanitization/results queries active sanitized output artifact', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization/results`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sanitizationRun.isLatestActive).toBe(true);
    expect(res.body.data.outputArtifact).toBeDefined();
  });
});
