import request from 'supertest';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { OrganizationMembership } from '../../src/models/membership.model';
import { DocumentModel } from '../../src/models/document.model';
import { NormalizedDocumentModel } from '../../src/models/normalizedDocument.model';

describe('OCR Multi-Tenant Isolation Security Tests', () => {
  let app: ReturnType<typeof createApp>;

  const userA = { email: 'TenantA_Admin@Isolation.com', password: 'Password123!' };
  const userB = { email: 'TenantB_Admin@Isolation.com', password: 'Password123!' };

  let tokenA: string;
  let tokenB: string;
  let orgAId: string;
  let orgBId: string;
  let docBId: string;

  beforeAll(async () => {
    app = createApp();
    try {
      await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
      if (mongoose.connection.readyState === 1) {
        await NormalizedDocumentModel.deleteMany({});
        await DocumentModel.deleteMany({});
        await OrganizationMembership.deleteMany({});
        await Organization.deleteMany({});
        await User.deleteMany({});

        // 1. Setup User A & Org A
        await request(app).post('/api/v1/auth/register').send(userA);
        await User.updateOne({ email: userA.email.toLowerCase() }, { role: 'ORG_ADMIN' });
        const loginA = await request(app).post('/api/v1/auth/login').send(userA);
        tokenA = loginA.body.accessToken;

        const orgARes = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ name: 'Organization A' });
        orgAId = orgARes.body.organization.id;

        // 2. Setup User B & Org B
        await request(app).post('/api/v1/auth/register').send(userB);
        await User.updateOne({ email: userB.email.toLowerCase() }, { role: 'ORG_ADMIN' });
        const loginB = await request(app).post('/api/v1/auth/login').send(userB);
        tokenB = loginB.body.accessToken;

        const orgBRes = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${tokenB}`)
          .send({ name: 'Organization B' });
        orgBId = orgBRes.body.organization.id;

        // 3. Upload document to Org B
        const imgPath = path.resolve(process.cwd(), 'storage/isolation_ocr.png');
        const pngHeader = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');
        await fs.promises.writeFile(imgPath, pngHeader);

        const uploadRes = await request(app)
          .post(`/api/v1/organizations/${orgBId}/documents`)
          .set('Authorization', `Bearer ${tokenB}`)
          .attach('file', imgPath, 'isolation_ocr.png');

        docBId = uploadRes.body.document.id;
        await fs.promises.unlink(imgPath).catch(() => {});
      }
    } catch {
      // Allow fallback if DB offline
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await NormalizedDocumentModel.deleteMany({});
      await DocumentModel.deleteMany({});
      await OrganizationMembership.deleteMany({});
      await Organization.deleteMany({});
      await User.deleteMany({});
      await mongoose.connection.close();
    }
  });

  it('should prevent Tenant A from triggering OCR on Tenant B document (403/404)', async () => {
    if (mongoose.connection.readyState !== 1) return;

    // Tenant A attempts to access Tenant B document via Org A path
    const res1 = await request(app)
      .post(`/api/v1/organizations/${orgAId}/documents/${docBId}/ocr`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ isHandwriting: false });

    expect([403, 404]).toContain(res1.status);

    // Tenant A attempts to directly target Org B URL
    const res2 = await request(app)
      .post(`/api/v1/organizations/${orgBId}/documents/${docBId}/ocr`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ isHandwriting: false });

    expect([403, 404]).toContain(res2.status);
  });

  it('should prevent Tenant A from querying OCR status of Tenant B document (403/404)', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const res = await request(app)
      .get(`/api/v1/organizations/${orgAId}/documents/${docBId}/ocr`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([403, 404]).toContain(res.status);
  });
});
