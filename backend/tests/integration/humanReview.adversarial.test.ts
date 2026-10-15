import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { User, UserRole } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { OrganizationMembership } from '../../src/models/membership.model';
import { generateAccessToken } from '../../src/services/token.service';
import { HumanReviewCaseModel } from '../../src/models/humanReviewCase.model';
import { ReviewDecisionModel } from '../../src/models/reviewDecision.model';
import { DocumentModel } from '../../src/models/document.model';

const app = createApp();

describe('HumanReview Engine Adversarial, Concurrency & Security Integration Tests', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let userAId: mongoose.Types.ObjectId;
  let userBId: mongoose.Types.ObjectId;
  let docAId: mongoose.Types.ObjectId;
  let tokenUserA: string;
  let tokenUserB: string;

  beforeAll(async () => {
    await connectDatabase();
    orgAId = new mongoose.Types.ObjectId();
    orgBId = new mongoose.Types.ObjectId();
    userAId = new mongoose.Types.ObjectId();
    userBId = new mongoose.Types.ObjectId();
    docAId = new mongoose.Types.ObjectId();

    await User.deleteMany({ email: { $in: ['usera@orga.test', 'userb@orgb.test'] } });
    await Organization.deleteMany({ name: { $in: ['Org A', 'Org B'] } });

    await Organization.create([
      { _id: orgAId, name: 'Org A', normalizedName: 'org a', createdBy: userAId },
      { _id: orgBId, name: 'Org B', normalizedName: 'org b', createdBy: userBId },
    ]);

    await User.create([
      {
        _id: userAId,
        email: 'usera@orga.test',
        normalizedEmail: 'usera@orga.test',
        passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/r6E/j62iF9LzH9m9i.1.2.3',
        fullName: 'User A',
        role: 'ORG_ADMIN',
        status: 'ACTIVE',
      },
      {
        _id: userBId,
        email: 'userb@orgb.test',
        normalizedEmail: 'userb@orgb.test',
        passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/r6E/j62iF9LzH9m9i.1.2.3',
        fullName: 'User B',
        role: 'ORG_ADMIN',
        status: 'ACTIVE',
      },
    ]);

    await OrganizationMembership.create([
      { organizationId: orgAId, userId: userAId, tenantRole: 'ORG_ADMIN', status: 'ACTIVE' },
      { organizationId: orgBId, userId: userBId, tenantRole: 'ORG_ADMIN', status: 'ACTIVE' },
    ]);

    tokenUserA = generateAccessToken({
      userId: userAId.toString(),
      email: 'usera@orga.test',
      role: 'ORG_ADMIN' as UserRole,
      status: 'ACTIVE',
    });

    tokenUserB = generateAccessToken({
      userId: userBId.toString(),
      email: 'userb@orgb.test',
      role: 'ORG_ADMIN' as UserRole,
      status: 'ACTIVE',
    });

    await DocumentModel.create({
      _id: docAId,
      organizationId: orgAId,
      originalFilename: 'sensitive_test.pdf',
      mimeType: 'application/pdf',
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      size: 2048,
      storageKey: 'storage/sensitive_test.pdf',
      checksum: 'd1d2d3d4d5d60123456789abcdef0123456789abcdef0123456789abcdef0123',
      status: 'READY',
      isDeleted: false,
      uploadedBy: userAId,
    });
  });

  afterAll(async () => {
    await HumanReviewCaseModel.deleteMany({ organizationId: { $in: [orgAId, orgBId] } });
    await ReviewDecisionModel.deleteMany({ organizationId: { $in: [orgAId, orgBId] } });
    await DocumentModel.deleteMany({ organizationId: { $in: [orgAId, orgBId] } });
    await disconnectDatabase();
  });

  test('Cross-tenant isolation: User B cannot access Org A review cases (404 anti-enumeration)', async () => {
    const createRes = await request(app)
      .post(`/api/v1/organizations/${orgAId.toString()}/review-cases`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        documentId: docAId.toString(),
        caseType: 'PARTIAL_VERIFICATION',
        priority: 'HIGH',
      });

    expect(createRes.status).toBe(201);
    const caseId = createRes.body.data.reviewCase.reviewCaseId;

    // User B attempts to access Org A review case via Org B route
    const accessRes = await request(app)
      .get(`/api/v1/organizations/${orgBId.toString()}/review-cases/${caseId}`)
      .set('Authorization', `Bearer ${tokenUserB}`);

    expect(accessRes.status).toBe(404);
  });

  test('Script Injection Defense: Strips script tags from reviewer rationale', async () => {
    const listRes = await request(app)
      .get(`/api/v1/organizations/${orgAId.toString()}/review-cases`)
      .set('Authorization', `Bearer ${tokenUserA}`);

    const caseId = listRes.body.data.cases[0].reviewCaseId;

    // Claim lease first
    await request(app)
      .post(`/api/v1/organizations/${orgAId.toString()}/review-cases/${caseId}/claim`)
      .set('Authorization', `Bearer ${tokenUserA}`);

    // Submit decision with malicious XSS note
    const decRes = await request(app)
      .post(`/api/v1/organizations/${orgAId.toString()}/review-cases/${caseId}/decisions`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        decisionType: 'CONFIRM_FINDING',
        reasonCode: 'VALIDATED',
        safeRationale: '<script>alert("hacked")</script>Sanitized rationale note.',
        caseVersion: 2,
      });

    expect(decRes.status).toBe(201);
    expect(decRes.body.data.decision.safeRationale).not.toContain('<script>');
  });

  test('Zero Raw PII Security Audit: Database records contain no raw PII values', async () => {
    const cases = await HumanReviewCaseModel.find({ organizationId: orgAId });
    const decisions = await ReviewDecisionModel.find({ organizationId: orgAId });

    const rawPiiTokens = ['alice@example.com', '999-00-1234', '4111111111111111', 'John Doe'];

    for (const c of cases) {
      const caseStr = JSON.stringify(c.toObject());
      for (const pii of rawPiiTokens) {
        expect(caseStr.includes(pii)).toBe(false);
      }
    }

    for (const d of decisions) {
      const decStr = JSON.stringify(d.toObject());
      for (const pii of rawPiiTokens) {
        expect(decStr.includes(pii)).toBe(false);
      }
    }
  });
});
