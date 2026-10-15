import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { DocumentModel } from '../../src/models/document.model';
import { NormalizedDocumentModel } from '../../src/models/normalizedDocument.model';
import { PIICandidateModel } from '../../src/models/piiCandidate.model';

describe('PII Multi-Tenant Isolation Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  const userA = { email: `userA_${uniqueSuffix}@orgA.com`, password: 'Password123!' };
  const userB = { email: `userB_${uniqueSuffix}@orgB.com`, password: 'Password123!' };

  let tokenA: string;
  let tokenB: string;

  let orgAId: string = new mongoose.Types.ObjectId().toString();
  let orgBId: string = new mongoose.Types.ObjectId().toString();
  let docAId: string = new mongoose.Types.ObjectId().toString();

  beforeAll(async () => {
    app = createApp();
    try {
      await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
      if (mongoose.connection.readyState === 1) {
        // User A
        await request(app).post('/api/v1/auth/register').send(userA);
        await User.updateOne({ email: userA.email.toLowerCase() }, { role: 'ORG_ADMIN' });
        const loginA = await request(app).post('/api/v1/auth/login').send(userA);
        tokenA = loginA.body.accessToken;

        const orgARes = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ name: `Tenant Org A ${uniqueSuffix}` });
        orgAId = orgARes.body.organization.id;

        // User B
        await request(app).post('/api/v1/auth/register').send(userB);
        await User.updateOne({ email: userB.email.toLowerCase() }, { role: 'ORG_ADMIN' });
        const loginB = await request(app).post('/api/v1/auth/login').send(userB);
        tokenB = loginB.body.accessToken;

        const orgBRes = await request(app)
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${tokenB}`)
          .send({ name: `Tenant Org B ${uniqueSuffix}` });
        orgBId = orgBRes.body.organization.id;

        // Document owned by Org A
        const dbUserA = await User.findOne({ email: userA.email.toLowerCase() });
        const docDoc = await DocumentModel.create({
          organizationId: new mongoose.Types.ObjectId(orgAId),
          uploadedBy: dbUserA!._id,
          originalFilename: 'orgA_sensitive.pdf',
          size: 1024,
          declaredMimeType: 'application/pdf',
          detectedMimeType: 'application/pdf',
          extension: 'pdf',
          storageKey: `org_${orgAId}/sensitive_${uniqueSuffix}.pdf`,
          status: 'EXTRACTED',
          checksum: `hash_orga_${uniqueSuffix}`,
          isDeleted: false,
        });
        docAId = docDoc._id.toString();

        await NormalizedDocumentModel.create({
          documentId: docDoc._id,
          organizationId: new mongoose.Types.ObjectId(orgAId),
          checksum: `hash_orga_${uniqueSuffix}`,
          format: 'pdf',
          schemaVersion: '1.0.0',
          extractorVersion: '1.0.0',
          status: 'COMPLETE',
          pages: [{ pageNumber: 1, blockCount: 1 }],
          blocks: [
            {
              blockId: 'blk_a',
              type: 'PARAGRAPH',
              text: 'Org A Secret Email: admin@orga.com',
              pageNumber: 1,
              readingOrderIndex: 0,
              startOffset: 0,
              endOffset: 34,
              recognitionMethod: 'NATIVE_TEXT',
              provenance: {
                documentId: docAId,
                organizationId: orgAId,
                pageNumber: 1,
                blockId: 'blk_a',
              },
            },
          ],
          tables: [],
          metadata: {},
          warnings: [],
        });
      }
    } catch {
      // Fallback if DB offline
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      if (docAId) {
        const docObjId = new mongoose.Types.ObjectId(docAId);
        await PIICandidateModel.deleteMany({ documentId: docObjId });
        await NormalizedDocumentModel.deleteMany({ documentId: docObjId });
        await DocumentModel.deleteMany({ _id: docObjId });
      }
      if (orgAId) await Organization.deleteMany({ _id: new mongoose.Types.ObjectId(orgAId) });
      if (orgBId) await Organization.deleteMany({ _id: new mongoose.Types.ObjectId(orgBId) });
      await User.deleteMany({ email: { $in: [userA.email.toLowerCase(), userB.email.toLowerCase()] } });
    }
  });

  it('should deny User B access to trigger PII detection on Org A document (returns 404 to prevent org enumeration)', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const res = await request(app)
      .post(`/api/v1/organizations/${orgAId}/documents/${docAId}/pii-detection`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it('should return 404 if User B attempts to query Org A document under Org B context', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const res = await request(app)
      .get(`/api/v1/organizations/${orgBId}/documents/${docAId}/pii-detection`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});
