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

describe('Sanitization Concurrency Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userCredentials = {
    email: `sanit_conc_${uniqueSuffix}@tenant.com`,
    password: 'Password123!',
    firstName: 'Sanit',
    lastName: 'Conc',
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
      .send({ name: `Sanit Conc Org ${uniqueSuffix}` });
    orgId = orgRes.body.organization.id;

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `conc_sanit_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Author (Parallel User) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const realChecksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const user = await User.findOne({ normalizedEmail: userCredentials.email.toLowerCase() });
    const docDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgId),
      uploadedBy: user!._id,
      originalFilename: 'conc_sanit_doc.pdf',
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
  }, 30000);

  afterAll(async () => {
    if (sampleFilePath && fs.existsSync(sampleFilePath)) {
      await fs.promises.unlink(sampleFilePath).catch(() => {});
    }
  });

  test('simultaneous parallel requests deduplicate cleanly and enforce single active run invariant', async () => {
    const promises = Array.from({ length: 5 }).map(() =>
      request(app)
        .post(`/api/v1/organizations/${orgId}/documents/${docId}/sanitization`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ operation: 'FULL_CLEAN' })
    );

    const results = await Promise.all(promises);

    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }

    const activeRuns = await MetadataSanitizationRunModel.find({
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: new mongoose.Types.ObjectId(docId),
      isLatestActive: true,
    });

    expect(activeRuns.length).toBe(1);
  }, 20000);
});
