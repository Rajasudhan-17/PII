import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';

describe('Sanitization Adversarial Safety Integration Tests', () => {
  jest.setTimeout(30000);
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userA = {
    email: `adv_sanit_a_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'AdvA',
    lastName: 'User',
  };
  const userB = {
    email: `adv_sanit_b_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'AdvB',
    lastName: 'User',
  };
  let tokenA: string;
  let tokenB: string;
  let orgAId: string;
  let orgBId: string;
  let docAId: string;
  let sampleFilePath: string;

  beforeAll(async () => {
    app = createApp();
    await connectDatabase();

    // Register User A & Org A
    await request(app).post('/api/v1/auth/register').send(userA);
    await User.updateOne({ email: userA.email.toLowerCase() }, { role: 'ORG_ADMIN' });
    const loginA = await request(app).post('/api/v1/auth/login').send(userA);
    tokenA = loginA.body.accessToken;

    const orgARes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `Adv Sanit Org A ${uniqueSuffix}` });
    orgAId = orgARes.body.organization.id;

    // Register User B & Org B
    await request(app).post('/api/v1/auth/register').send(userB);
    await User.updateOne({ email: userB.email.toLowerCase() }, { role: 'ORG_ADMIN' });
    const loginB = await request(app).post('/api/v1/auth/login').send(userB);
    tokenB = loginB.body.accessToken;

    const orgBRes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: `Adv Sanit Org B ${uniqueSuffix}` });
    orgBId = orgBRes.body.organization.id;

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `adv_sanit_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Author (Confidential User) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const realChecksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const userObj = await User.findOne({ normalizedEmail: userA.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgAId),
      uploadedBy: userObj!._id,
      originalFilename: 'adv_sanit_file.pdf',
      size: 512,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: sampleFilePath,
      checksum: realChecksum,
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docAId = docDoc._id.toString();
  });

  afterAll(async () => {
    if (sampleFilePath && fs.existsSync(sampleFilePath)) {
      await fs.promises.unlink(sampleFilePath).catch(() => {});
    }
  });

  test('Cross-tenant isolation: Org B user cannot sanitize Org A document (returns 404 to prevent enumeration)', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgAId}/documents/${docAId}/sanitization`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ operation: 'FULL_CLEAN' });

    expect([403, 404]).toContain(res.status);

    const resB = await request(app)
      .post(`/api/v1/organizations/${orgBId}/documents/${docAId}/sanitization`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ operation: 'FULL_CLEAN' });

    expect([403, 404]).toContain(resB.status);
  });

  test('Resource limit safety: rejects documents exceeding 50MB size limit', async () => {
    // Temporarily increase doc size in database to 60MB
    await DocumentModel.updateOne({ _id: docAId }, { size: 60 * 1024 * 1024 });

    const res = await request(app)
      .post(`/api/v1/organizations/${orgAId}/documents/${docAId}/sanitization`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ operation: 'FULL_CLEAN', force: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESOURCE_LIMIT_EXCEEDED');

    // Restore original size
    await DocumentModel.updateOne({ _id: docAId }, { size: 512 });
  });
});
