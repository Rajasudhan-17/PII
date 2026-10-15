import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { User, UserRole } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { generateAccessToken } from '../../src/services/token.service';
import { HumanReviewCaseModel } from '../../src/models/humanReviewCase.model';
import { ReviewDecisionModel } from '../../src/models/reviewDecision.model';
import { ReviewFeedbackModel } from '../../src/models/reviewFeedback.model';
import { DocumentModel } from '../../src/models/document.model';
import { OrganizationMembership } from '../../src/models/membership.model';

const app = createApp();

describe('HumanReview Routes Integration End-to-End Suite', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminUserId: mongoose.Types.ObjectId;
  let reviewerUserId: mongoose.Types.ObjectId;
  let docId: mongoose.Types.ObjectId;
  let adminToken: string;
  let reviewerToken: string;

  beforeAll(async () => {
    await connectDatabase();
    orgId = new mongoose.Types.ObjectId();
    adminUserId = new mongoose.Types.ObjectId();
    reviewerUserId = new mongoose.Types.ObjectId();
    docId = new mongoose.Types.ObjectId();

    await User.deleteMany({ email: { $in: ['admin@review.test', 'reviewer@review.test'] } });
    await Organization.deleteMany({ name: 'Test Review Org' });

    await Organization.create({
      _id: orgId,
      name: 'Test Review Org',
      normalizedName: 'test review org',
      createdBy: adminUserId,
    });

    await User.create([
      {
        _id: adminUserId,
        email: 'admin@review.test',
        normalizedEmail: 'admin@review.test',
        passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/r6E/j62iF9LzH9m9i.1.2.3',
        fullName: 'Admin User',
        role: 'ORG_ADMIN',
        status: 'ACTIVE',
      },
      {
        _id: reviewerUserId,
        email: 'reviewer@review.test',
        normalizedEmail: 'reviewer@review.test',
        passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/r6E/j62iF9LzH9m9i.1.2.3',
        fullName: 'Reviewer User',
        role: 'REVIEWER',
        status: 'ACTIVE',
      },
    ]);

    adminToken = generateAccessToken({
      userId: adminUserId.toString(),
      email: 'admin@review.test',
      role: 'ORG_ADMIN' as UserRole,
      status: 'ACTIVE',
    });

    reviewerToken = generateAccessToken({
      userId: reviewerUserId.toString(),
      email: 'reviewer@review.test',
      role: 'REVIEWER' as UserRole,
      status: 'ACTIVE',
    });

    await OrganizationMembership.create([
      { organizationId: orgId, userId: adminUserId, tenantRole: 'ORG_ADMIN', status: 'ACTIVE' },
      { organizationId: orgId, userId: reviewerUserId, tenantRole: 'REVIEWER', status: 'ACTIVE' },
    ]);

    await DocumentModel.create({
      _id: docId,
      organizationId: orgId,
      originalFilename: 'review_doc.pdf',
      mimeType: 'application/pdf',
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      size: 4096,
      storageKey: 'storage/review_doc.pdf',
      checksum: 'e1e2e3e4e5e60123456789abcdef0123456789abcdef0123456789abcdef0123',
      status: 'READY',
      isDeleted: false,
      uploadedBy: adminUserId,
    });
  });

  afterAll(async () => {
    await HumanReviewCaseModel.deleteMany({ organizationId: orgId });
    await ReviewDecisionModel.deleteMany({ organizationId: orgId });
    await ReviewFeedbackModel.deleteMany({ organizationId: orgId });
    await DocumentModel.deleteMany({ organizationId: orgId });
    await OrganizationMembership.deleteMany({ organizationId: orgId });
    await disconnectDatabase();
  });

  test('POST /review-cases creates a new human review case', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId.toString()}/review-cases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        documentId: docId.toString(),
        caseType: 'PARTIAL_VERIFICATION',
        priority: 'HIGH',
        reasonCodes: ['PARTIAL_VERIFICATION_OBSERVED'],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.reviewCase.caseType).toBe('PARTIAL_VERIFICATION');
    expect(res.body.data.reviewCase.status).toBe('OPEN');
  });

  test('GET /review-cases lists tenant review cases', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId.toString()}/review-cases`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cases.length).toBeGreaterThan(0);
  });

  test('POST /review-cases/:caseId/assign assigns a reviewer', async () => {
    const listRes = await request(app)
      .get(`/api/v1/organizations/${orgId.toString()}/review-cases`)
      .set('Authorization', `Bearer ${adminToken}`);

    const caseId = listRes.body.data.cases[0].reviewCaseId;

    const assignRes = await request(app)
      .post(`/api/v1/organizations/${orgId.toString()}/review-cases/${caseId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetReviewerId: reviewerUserId.toString(),
      });

    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.reviewCase.status).toBe('ASSIGNED');
  });

  test('POST /review-cases/:caseId/claim claims case lease', async () => {
    const listRes = await request(app)
      .get(`/api/v1/organizations/${orgId.toString()}/review-cases`)
      .set('Authorization', `Bearer ${adminToken}`);

    const caseId = listRes.body.data.cases[0].reviewCaseId;

    const claimRes = await request(app)
      .post(`/api/v1/organizations/${orgId.toString()}/review-cases/${caseId}/claim`)
      .set('Authorization', `Bearer ${reviewerToken}`);

    expect(claimRes.status).toBe(200);
    expect(claimRes.body.data.reviewCase.status).toBe('IN_REVIEW');
  });

  test('POST /review-cases/:caseId/decisions submits review decision and resolves case', async () => {
    const listRes = await request(app)
      .get(`/api/v1/organizations/${orgId.toString()}/review-cases`)
      .set('Authorization', `Bearer ${adminToken}`);

    const reviewCase = listRes.body.data.cases[0];

    const decRes = await request(app)
      .post(`/api/v1/organizations/${orgId.toString()}/review-cases/${reviewCase.reviewCaseId}/decisions`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        decisionType: 'CONFIRM_REDACTION',
        reasonCode: 'VALIDATED_BY_HUMAN',
        safeRationale: 'Human reviewer verified redaction state.',
        caseVersion: reviewCase.caseVersion,
      });

    expect(decRes.status).toBe(201);
    expect(decRes.body.data.reviewCase.status).toBe('RESOLVED');
  });

  test('POST /feedback submits feedback for resolved decision', async () => {
    const listRes = await request(app)
      .get(`/api/v1/organizations/${orgId.toString()}/review-cases`)
      .set('Authorization', `Bearer ${adminToken}`);

    const caseId = listRes.body.data.cases[0].reviewCaseId;
    const historyRes = await request(app)
      .get(`/api/v1/organizations/${orgId.toString()}/review-cases/${caseId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const decisionId = historyRes.body.data.decisions[0].reviewDecisionId;

    const fbRes = await request(app)
      .post(`/api/v1/organizations/${orgId.toString()}/feedback`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        reviewCaseId: caseId,
        reviewDecisionId: decisionId,
        feedbackCategory: 'FALSE_POSITIVE',
        sourceDecisionReference: 'DECISION_REDACT',
        reviewedOutcome: 'REVIEWED_KEEP',
      });

    expect(fbRes.status).toBe(201);
    expect(fbRes.body.data.feedback.approvalState).toBe('PENDING_APPROVAL');
  });

  test('POST /feedback/:feedbackId/approve approves feedback via admin', async () => {
    const fbListRes = await request(app)
      .get(`/api/v1/organizations/${orgId.toString()}/feedback`)
      .set('Authorization', `Bearer ${adminToken}`);

    const feedbackId = fbListRes.body.data.feedback[0].feedbackId;

    const appRes = await request(app)
      .post(`/api/v1/organizations/${orgId.toString()}/feedback/${feedbackId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        approve: true,
        approvalNotes: 'Approved for versioned dataset.',
      });

    expect(appRes.status).toBe(200);
    expect(appRes.body.data.feedback.approvalState).toBe('APPROVED');
  });

  test('POST /datasets materializes evaluation dataset version', async () => {
    const dsRes = await request(app)
      .post(`/api/v1/organizations/${orgId.toString()}/datasets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        versionName: 'eval_dataset_q4_2026',
      });

    expect(dsRes.status).toBe(201);
    expect(dsRes.body.data.datasetVersion.status).toBe('MATERIALIZED');
  });

  test('POST /evaluations creates versioned model evaluation record', async () => {
    const dsListRes = await request(app)
      .get(`/api/v1/organizations/${orgId.toString()}/datasets`)
      .set('Authorization', `Bearer ${adminToken}`);

    const dsVersionId = dsListRes.body.data.datasets[0].datasetVersionId;

    const evalRes = await request(app)
      .post(`/api/v1/organizations/${orgId.toString()}/evaluations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        datasetVersionId: dsVersionId,
        targetModelVersion: '2.0.0-candidate',
        targetPolicyVersion: '1.1.0',
      });

    expect(evalRes.status).toBe(201);
    expect(evalRes.body.data.evaluationRecord.status).toBe('COMPLETED');
  });
});
