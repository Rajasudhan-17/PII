import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { OutputArtifactModel } from '../../src/models/outputArtifact.model';

describe('Sanitization Checksum-Aware Idempotency & Verification Safety Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = {
    email: `sanit_chk_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'Sanit',
    lastName: 'Chk',
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
      .send({ name: `Sanit Chk Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `sanit_chk_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Author (Initial) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const initialChecksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const user = (await User.findOne({ email: userCredentials.email.toLowerCase() })) || (await User.findOne({ normalizedEmail: userCredentials.email.toLowerCase() }));
    const userId = user ? user._id : new mongoose.Types.ObjectId();
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: userId,
      originalFilename: 'chk_doc.pdf',
      size: 512,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: sampleFilePath,
      checksum: initialChecksum,
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

  test('Different source checksum produces distinct execution identity and new run', async () => {
    // 1. Initial sanitization run with OLD checksum
    const res1 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'FULL_CLEAN' });

    expect(res1.status).toBe(200);
    const run1Id = res1.body.data.sanitizationRun.sanitizationRunId;

    // 2. Update physical document file on disk and document checksum in database to simulate upstream edit
    const newPdfContent = '%PDF-1.4 1 0 obj << /Author (Updated Version) >> stream (New Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, newPdfContent, 'binary');
    const newChecksum = crypto.createHash('sha256').update(Buffer.from(newPdfContent, 'binary')).digest('hex');

    await DocumentModel.updateOne({ _id: docId }, { checksum: newChecksum });

    // 3. Second sanitization run with NEW checksum
    const res2 = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'FULL_CLEAN' });

    expect(res2.status).toBe(200);
    const run2Id = res2.body.data.sanitizationRun.sanitizationRunId;

    expect(run1Id).not.toBe(run2Id);
  });

  test('Stale source protection rejects processing when disk content checksum differs from document record', async () => {
    // Mutate stored database checksums to simulate stale source condition
    await DocumentModel.updateOne({ _id: docId }, { checksum: 'stale_checksum_mismatch_123' });
    await OutputArtifactModel.updateMany({ sourceDocumentId: docId }, { outputChecksum: 'stale_checksum_mismatch_123' });

    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ operation: 'FULL_CLEAN', force: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('STALE_SOURCE');
  });
});
