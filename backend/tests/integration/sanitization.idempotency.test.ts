import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { MetadataSanitizationRunModel } from '../../src/models/metadataSanitizationRun.model';

describe('Sanitization Idempotency Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = {
    email: `sanit_idem_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'Sanit',
    lastName: 'Idem',
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
      .send({ name: `Sanit Idem Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `sanit_idem_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Author (Alice) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const realChecksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const user = await User.findOne({ normalizedEmail: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: 'idem_doc.pdf',
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

  test('reuses existing completed sanitization run on repeated requests', async () => {
    const res1 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'FULL_CLEAN' });

    expect(res1.status).toBe(200);
    const run1Id = res1.body.data.sanitizationRun.sanitizationRunId;

    const res2 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'FULL_CLEAN' });

    expect(res2.status).toBe(200);
    const run2Id = res2.body.data.sanitizationRun.sanitizationRunId;

    expect(run1Id).toBe(run2Id);
  });

  test('creates new sanitization run when force=true is passed', async () => {
    const res1 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'FULL_CLEAN' });

    const run1Id = res1.body.data.sanitizationRun.sanitizationRunId;

    const res2 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'FULL_CLEAN', force: true });

    expect(res2.status).toBe(200);
    const run2Id = res2.body.data.sanitizationRun.sanitizationRunId;

    expect(run1Id).not.toBe(run2Id);

    const oldRun = await MetadataSanitizationRunModel.findOne({ sanitizationRunId: run1Id });
    const newRun = await MetadataSanitizationRunModel.findOne({ sanitizationRunId: run2Id });

    expect(oldRun?.isLatestActive).toBe(false);
    expect(newRun?.isLatestActive).toBe(true);
  });
});
