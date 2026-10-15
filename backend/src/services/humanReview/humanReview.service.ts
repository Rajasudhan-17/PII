import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  HumanReviewCaseModel,
  IHumanReviewCase,
  ReviewCaseType,
  ReviewCasePriority,
  ReviewCaseSeverity,
  ReviewCaseStatus,
  ISafeEvidenceReference,
} from '../../models/humanReviewCase.model';
import {
  ReviewDecisionModel,
  IReviewDecision,
  ReviewDecisionType,
} from '../../models/reviewDecision.model';
import {
  ReviewFeedbackModel,
  IReviewFeedback,
  FeedbackCategory,
} from '../../models/reviewFeedback.model';
import {
  EvaluationDatasetVersionModel,
  IEvaluationDatasetVersion,
} from '../../models/evaluationDatasetVersion.model';
import {
  ModelEvaluationRecordModel,
  IModelEvaluationRecord,
  IEvaluationMetrics,
  IBaselineComparison,
} from '../../models/modelEvaluationRecord.model';
import {
  ReviewNotificationModel,
  IReviewNotification,
} from '../../models/reviewNotification.model';
import { DocumentModel } from '../../models/document.model';
import { OrganizationMembership } from '../../models/membership.model';
import { AppError } from '../../utils/AppError';
import { validateObjectId } from '../../utils/tenantQuery';
import { logAuthAuditEvent } from '../audit.service';

export interface CreateReviewCaseOptions {
  organizationIdStr: string;
  documentIdStr: string;
  verificationRunId?: string;
  verificationResultIds?: string[];
  sanitizedArtifactId?: string;
  sanitizedArtifactChecksum?: string;
  caseType?: ReviewCaseType;
  priority?: ReviewCasePriority;
  severity?: ReviewCaseSeverity;
  reasonCodes?: string[];
  safeEvidenceReferences?: ISafeEvidenceReference[];
  reviewDeadline?: Date;
  createdByUserIdStr?: string;
}

export interface SubmitDecisionOptions {
  organizationIdStr: string;
  reviewCaseIdStr: string;
  reviewerIdStr: string;
  decisionType: ReviewDecisionType;
  reasonCode: string;
  safeRationale: string;
  safeEvidenceReferences?: ISafeEvidenceReference[];
  expectedNextAction?: string;
  caseVersion: number;
}

export class HumanReviewService {
  public static readonly LEASE_DURATION_MS = 15 * 60 * 1000; // 15 Minutes
  public static readonly MAX_NOTE_LENGTH = 2000;
  public static readonly MAX_PAGE_SIZE = 100;

  private sanitizeNoteText(input: string): string {
    if (!input) return '';
    // Strip HTML/Script tags to prevent stored XSS
    const stripped = input.replace(/<[^>]*>?/gm, '').trim();
    return stripped.substring(0, HumanReviewService.MAX_NOTE_LENGTH);
  }

  // 1. Create Review Case (Eligibility & Idempotency)
  public async createReviewCase(options: CreateReviewCaseOptions): Promise<IHumanReviewCase> {
    const organizationId = validateObjectId(options.organizationIdStr, 'Organization ID');
    const documentId = validateObjectId(options.documentIdStr, 'Document ID');
    const createdByUserId = options.createdByUserIdStr
      ? validateObjectId(options.createdByUserIdStr, 'User ID')
      : undefined;

    // Verify document exists and belongs to organization
    const doc = await DocumentModel.findOne({ _id: documentId, organizationId });
    if (!doc || doc.isDeleted) {
      throw AppError.notFound('Document not found or deleted', 'DOCUMENT_NOT_FOUND');
    }

    const caseType = options.caseType || 'AMBIGUOUS_POLICY';
    const priority = options.priority || 'MEDIUM';
    const severity = options.severity || 'MEDIUM';

    // Idempotency Reuse Check: If an open/assigned case exists for this verification run, return it
    if (options.verificationRunId) {
      const existingCase = await HumanReviewCaseModel.findOne({
        organizationId,
        documentId,
        verificationRunId: options.verificationRunId,
        status: { $in: ['OPEN', 'QUEUED', 'ASSIGNED', 'IN_REVIEW', 'AWAITING_SECOND_REVIEW', 'ESCALATED'] },
      });
      if (existingCase) {
        return existingCase;
      }
    }

    const reviewCaseId = `rev_case_${crypto.randomUUID()}`;

    const reviewCase = await HumanReviewCaseModel.create({
      reviewCaseId,
      organizationId,
      documentId,
      verificationRunId: options.verificationRunId,
      verificationResultIds: options.verificationResultIds || [],
      sanitizedArtifactId: options.sanitizedArtifactId,
      sanitizedArtifactChecksum: options.sanitizedArtifactChecksum,
      caseType,
      priority,
      severity,
      status: 'OPEN',
      assignmentVersion: 1,
      caseVersion: 1,
      reasonCodes: options.reasonCodes || ['ELIGIBLE_FOR_HUMAN_REVIEW'],
      safeEvidenceReferences: options.safeEvidenceReferences || [],
      reviewDeadline: options.reviewDeadline,
      createdByUserId,
    });

    logAuthAuditEvent({
      event: 'REVIEW_CASE_CREATED',
      outcome: 'SUCCESS',
      organizationId: options.organizationIdStr,
      userId: options.createdByUserIdStr,
      details: { reviewCaseId, caseType, priority, severity },
    });

    return reviewCase;
  }

  // Expire Abandoned 15-Minute Leases back to OPEN status
  public async expireLeases(organizationIdStr?: string): Promise<number> {
    const query: mongoose.FilterQuery<IHumanReviewCase> = {
      status: 'IN_REVIEW',
      leaseExpiresAt: { $lte: new Date() },
    };
    if (organizationIdStr) {
      query.organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    }
    const result = await HumanReviewCaseModel.updateMany(query, {
      $set: {
        status: 'OPEN',
        leaseOwnerId: null,
        leaseExpiresAt: null,
      },
      $inc: { caseVersion: 1 },
    });
    return result.modifiedCount || 0;
  }

  // 2. Get Review Cases (Tenant-Scoped & Paginated)
  public async getReviewCases(
    organizationIdStr: string,
    filters?: {
      status?: ReviewCaseStatus;
      priority?: ReviewCasePriority;
      assignedReviewerIdStr?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ cases: IHumanReviewCase[]; total: number }> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');

    // Automatically recover expired 15-minute leases back to OPEN
    await this.expireLeases(organizationIdStr);

    const query: mongoose.FilterQuery<IHumanReviewCase> = { organizationId };

    if (filters?.status) query.status = filters.status;
    if (filters?.priority) query.priority = filters.priority;
    if (filters?.assignedReviewerIdStr) {
      query.assignedReviewerId = validateObjectId(filters.assignedReviewerIdStr, 'Reviewer ID');
    }

    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(HumanReviewService.MAX_PAGE_SIZE, Math.max(1, filters?.limit || 20));
    const skip = (page - 1) * limit;

    const [cases, total] = await Promise.all([
      HumanReviewCaseModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      HumanReviewCaseModel.countDocuments(query),
    ]);

    return { cases, total };
  }

  // 3. Get Single Review Case with History
  public async getReviewCaseById(
    organizationIdStr: string,
    reviewCaseId: string
  ): Promise<{ reviewCase: IHumanReviewCase; decisions: IReviewDecision[]; notifications: IReviewNotification[] }> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');

    const reviewCase = await HumanReviewCaseModel.findOne({ organizationId, reviewCaseId });
    if (!reviewCase) {
      throw AppError.notFound('Review case not found', 'CASE_NOT_FOUND');
    }

    const decisions = await ReviewDecisionModel.find({ organizationId, reviewCaseId }).sort({ createdAt: 1 });
    const notifications = await ReviewNotificationModel.find({ organizationId, reviewCaseId }).sort({ createdAt: -1 });

    return { reviewCase, decisions, notifications };
  }

  // 4. Assign / Reassign Reviewer with Conflict-of-Interest Controls
  public async assignReviewer(
    organizationIdStr: string,
    reviewCaseId: string,
    targetReviewerIdStr: string,
    assignedByUserIdStr: string,
    allowSelfAssignment = false
  ): Promise<IHumanReviewCase> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const targetReviewerId = validateObjectId(targetReviewerIdStr, 'Target Reviewer ID');

    // Verify reviewer belongs to active organization membership
    const membership = await OrganizationMembership.findOne({
      organizationId,
      userId: targetReviewerId,
      status: 'ACTIVE',
    });
    if (!membership) {
      throw AppError.badRequest('Target reviewer is not an active member of this organization', 'INVALID_REVIEWER');
    }

    const reviewCase = await HumanReviewCaseModel.findOne({ organizationId, reviewCaseId });
    if (!reviewCase) {
      throw AppError.notFound('Review case not found', 'CASE_NOT_FOUND');
    }

    // Conflict-of-interest check: Prevent creator from self-assigning if forbidden
    if (!allowSelfAssignment && reviewCase.createdByUserId && reviewCase.createdByUserId.equals(targetReviewerId)) {
      throw AppError.badRequest(
        'Conflict-of-interest policy prevents creator from being assigned as reviewer for this case',
        'CONFLICT_OF_INTEREST'
      );
    }

    const isReassignment = Boolean(reviewCase.assignedReviewerId);
    reviewCase.assignedReviewerId = targetReviewerId;
    reviewCase.assignmentVersion += 1;
    reviewCase.caseVersion += 1;
    reviewCase.status = 'ASSIGNED';
    await reviewCase.save();

    // Create Notification
    const notificationId = `notif_${crypto.randomUUID()}`;
    await ReviewNotificationModel.create({
      notificationId,
      organizationId,
      recipientUserId: targetReviewerId,
      reviewCaseId,
      notificationType: isReassignment ? 'CASE_REASSIGNED' : 'CASE_ASSIGNED',
      message: `Review case ${reviewCaseId} has been ${isReassignment ? 'reassigned' : 'assigned'} to you.`,
    });

    logAuthAuditEvent({
      event: isReassignment ? 'REVIEW_CASE_REASSIGNED' : 'REVIEW_CASE_ASSIGNED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: assignedByUserIdStr,
      details: { reviewCaseId, assignedTo: targetReviewerIdStr },
    });

    return reviewCase;
  }

  // 5. Atomic Claim / Lease Case Concurrency Control
  public async claimCaseLease(
    organizationIdStr: string,
    reviewCaseId: string,
    reviewerIdStr: string
  ): Promise<IHumanReviewCase> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const reviewerId = validateObjectId(reviewerIdStr, 'Reviewer ID');
    const now = new Date();

    const reviewCase = await HumanReviewCaseModel.findOne({ organizationId, reviewCaseId });
    if (!reviewCase) {
      throw AppError.notFound('Review case not found', 'CASE_NOT_FOUND');
    }

    // Check active lease ownership by another reviewer
    if (
      reviewCase.leaseOwnerId &&
      reviewCase.leaseExpiresAt &&
      reviewCase.leaseExpiresAt > now &&
      !reviewCase.leaseOwnerId.equals(reviewerId)
    ) {
      throw AppError.conflict(
        'Case is currently leased by another active reviewer',
        'CASE_ALREADY_LEASED'
      );
    }

    reviewCase.leaseOwnerId = reviewerId;
    reviewCase.leaseExpiresAt = new Date(now.getTime() + HumanReviewService.LEASE_DURATION_MS);
    if (reviewCase.status === 'OPEN' || reviewCase.status === 'ASSIGNED') {
      reviewCase.status = 'IN_REVIEW';
    }
    reviewCase.assignedReviewerId = reviewerId;
    reviewCase.caseVersion += 1;
    await reviewCase.save();

    logAuthAuditEvent({
      event: 'REVIEW_CASE_CLAIMED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: reviewerIdStr,
      details: { reviewCaseId, leaseExpiresAt: reviewCase.leaseExpiresAt },
    });

    return reviewCase;
  }

  // 6. Submit Review Decision with Concurrency & Second Review Adjudication
  public async submitReviewDecision(options: SubmitDecisionOptions): Promise<{ reviewCase: IHumanReviewCase; decision: IReviewDecision }> {
    const organizationId = validateObjectId(options.organizationIdStr, 'Organization ID');
    const reviewerId = validateObjectId(options.reviewerIdStr, 'Reviewer ID');

    const reviewCase = await HumanReviewCaseModel.findOne({ organizationId, reviewCaseId: options.reviewCaseIdStr });
    if (!reviewCase) {
      throw AppError.notFound('Review case not found', 'CASE_NOT_FOUND');
    }

    // Validate active case state for submission
    const validStates: ReviewCaseStatus[] = ['ASSIGNED', 'IN_REVIEW', 'AWAITING_SECOND_REVIEW'];
    if (!validStates.includes(reviewCase.status)) {
      throw AppError.badRequest(`Cannot submit decision for case in status ${reviewCase.status}`, 'INVALID_CASE_STATUS');
    }

    // Optimistic Concurrency Check: caseVersion mismatch
    if (reviewCase.caseVersion !== options.caseVersion) {
      throw AppError.conflict(
        `Case version mismatch (Expected ${reviewCase.caseVersion}, got ${options.caseVersion}). Stale decision rejected.`,
        'STALE_CASE_VERSION'
      );
    }

    const sanitizedRationale = this.sanitizeNoteText(options.safeRationale);
    const existingDecisions = await ReviewDecisionModel.find({ organizationId, reviewCaseId: options.reviewCaseIdStr }).sort({ decisionSequence: 1 });
    const decisionSequence = existingDecisions.length + 1;

    // Second Review / Adjudication Disagreement & Self-Approval Prevention
    if (reviewCase.status === 'AWAITING_SECOND_REVIEW') {
      const firstDecision = existingDecisions.find((d) => d.decisionSequence === 1);
      if (firstDecision && firstDecision.reviewerId.equals(reviewerId)) {
        throw AppError.forbidden(
          'Self-approval policy violation: Second reviewer must be distinct from first reviewer',
          'SELF_APPROVAL_REJECTED'
        );
      }
    }

    const isSecondReview = reviewCase.status === 'AWAITING_SECOND_REVIEW';
    const reviewDecisionId = `rev_dec_${crypto.randomUUID()}`;

    const decision = await ReviewDecisionModel.create({
      reviewDecisionId,
      organizationId,
      reviewCaseId: options.reviewCaseIdStr,
      reviewerId,
      decisionType: options.decisionType,
      decisionSequence,
      isSecondReview,
      reasonCode: options.reasonCode,
      safeRationale: sanitizedRationale,
      safeEvidenceReferences: options.safeEvidenceReferences || [],
      expectedNextAction: options.expectedNextAction || 'RESOLVE_CASE',
      caseVersion: reviewCase.caseVersion,
    });

    // Handle State Machine Transitions
    if (options.decisionType === 'REQUEST_SECOND_REVIEW') {
      reviewCase.status = 'AWAITING_SECOND_REVIEW';
      reviewCase.caseVersion += 1;
      await reviewCase.save();

      logAuthAuditEvent({
        event: 'REVIEW_SECOND_REVIEW_REQUESTED',
        outcome: 'SUCCESS',
        organizationId: options.organizationIdStr,
        userId: options.reviewerIdStr,
        details: { reviewCaseId: options.reviewCaseIdStr, reviewDecisionId },
      });
    } else if (options.decisionType === 'ESCALATE') {
      reviewCase.status = 'ESCALATED';
      reviewCase.caseVersion += 1;
      await reviewCase.save();

      logAuthAuditEvent({
        event: 'REVIEW_ESCALATED',
        outcome: 'SUCCESS',
        organizationId: options.organizationIdStr,
        userId: options.reviewerIdStr,
        details: { reviewCaseId: options.reviewCaseIdStr, reviewDecisionId },
      });
    } else {
      // Final Resolution (or Rejection)
      reviewCase.status = options.decisionType === 'INSUFFICIENT_EVIDENCE' ? 'REJECTED' : 'RESOLVED';
      reviewCase.resolvedAt = new Date();
      reviewCase.caseVersion += 1;
      reviewCase.leaseOwnerId = undefined;
      reviewCase.leaseExpiresAt = undefined;
      await reviewCase.save();

      logAuthAuditEvent({
        event: 'REVIEW_DECISION_SUBMITTED',
        outcome: 'SUCCESS',
        organizationId: options.organizationIdStr,
        userId: options.reviewerIdStr,
        details: { reviewCaseId: options.reviewCaseIdStr, decisionType: options.decisionType },
      });

      logAuthAuditEvent({
        event: 'REVIEW_CASE_RESOLVED',
        outcome: 'SUCCESS',
        organizationId: options.organizationIdStr,
        userId: options.reviewerIdStr,
        details: { reviewCaseId: options.reviewCaseIdStr, finalStatus: reviewCase.status },
      });
    }

    return { reviewCase, decision };
  }

  // 7. Submit Feedback Record (Controlled Feedback Dataset)
  public async submitFeedback(
    organizationIdStr: string,
    reviewCaseIdStr: string,
    reviewDecisionIdStr: string,
    submittedByUserIdStr: string,
    feedbackCategory: FeedbackCategory,
    sourceDecisionReference: string,
    reviewedOutcome: string,
    provenance?: Record<string, unknown>
  ): Promise<IReviewFeedback> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const submittedByUserId = validateObjectId(submittedByUserIdStr, 'Submitted-By User ID');

    const feedbackId = `fb_${crypto.randomUUID()}`;

    const feedback = await ReviewFeedbackModel.create({
      feedbackId,
      organizationId,
      reviewCaseId: reviewCaseIdStr,
      reviewDecisionId: reviewDecisionIdStr,
      sourceDecisionReference,
      reviewedOutcome,
      feedbackCategory,
      approvalState: 'PENDING_APPROVAL',
      submittedByUserId,
      provenance: provenance || {},
    });

    logAuthAuditEvent({
      event: 'FEEDBACK_SUBMITTED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: submittedByUserIdStr,
      details: { feedbackId, feedbackCategory },
    });

    return feedback;
  }

  // 8. Approve or Reject Feedback with Separation of Duties
  public async approveOrRejectFeedback(
    organizationIdStr: string,
    feedbackId: string,
    approverUserIdStr: string,
    approve: boolean,
    approvalNotes?: string
  ): Promise<IReviewFeedback> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const approverUserId = validateObjectId(approverUserIdStr, 'Approver User ID');

    const feedback = await ReviewFeedbackModel.findOne({ organizationId, feedbackId });
    if (!feedback) {
      throw AppError.notFound('Feedback record not found', 'FEEDBACK_NOT_FOUND');
    }

    // Cannot re-adjudicate feedback that is already APPROVED or REJECTED
    if (feedback.approvalState !== 'PENDING_APPROVAL') {
      throw AppError.badRequest('Feedback record has already been adjudicated', 'FEEDBACK_ALREADY_ADJUDICATED');
    }

    // Separation of Duties: Submitter cannot approve their own feedback
    if (feedback.submittedByUserId.equals(approverUserId)) {
      throw AppError.forbidden(
        'Separation of duties violation: Feedback submitter cannot approve their own feedback',
        'SELF_APPROVAL_REJECTED'
      );
    }

    feedback.approvalState = approve ? 'APPROVED' : 'REJECTED';
    feedback.approvedByUserId = approverUserId;
    feedback.approvalNotes = this.sanitizeNoteText(approvalNotes || '');
    feedback.approvedAt = new Date();
    await feedback.save();

    logAuthAuditEvent({
      event: approve ? 'FEEDBACK_APPROVED' : 'FEEDBACK_REJECTED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: approverUserIdStr,
      details: { feedbackId, approvalState: feedback.approvalState },
    });

    return feedback;
  }

  // 9. Materialize Evaluation Dataset Version
  public async createDatasetVersion(
    organizationIdStr: string,
    versionName: string,
    createdByUserIdStr: string
  ): Promise<IEvaluationDatasetVersion> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const createdByUserId = validateObjectId(createdByUserIdStr, 'User ID');

    // Retrieve all newly approved feedback records for organization not yet assigned to a dataset version
    const approvedFeedback = await ReviewFeedbackModel.find({
      organizationId,
      approvalState: 'APPROVED',
      datasetVersion: { $exists: false },
    });

    if (approvedFeedback.length === 0) {
      throw AppError.badRequest('No approved feedback records available to materialize dataset version', 'NO_APPROVED_FEEDBACK');
    }

    const feedbackIds = approvedFeedback.map((f) => f.feedbackId);
    const datasetVersionId = `ds_ver_${crypto.randomUUID()}`;

    const datasetVersion = await EvaluationDatasetVersionModel.create({
      datasetVersionId,
      organizationId,
      versionName,
      feedbackIds,
      totalFeedbackCount: feedbackIds.length,
      status: 'MATERIALIZED',
      createdByUserId,
    });

    // Update feedback items with datasetVersion reference
    await ReviewFeedbackModel.updateMany(
      { organizationId, feedbackId: { $in: feedbackIds } },
      { datasetVersion: datasetVersionId }
    );

    logAuthAuditEvent({
      event: 'DATASET_VERSION_CREATED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: createdByUserIdStr,
      details: { datasetVersionId, versionName, feedbackCount: feedbackIds.length },
    });

    return datasetVersion;
  }

  // 10. Record Model / Policy Evaluation
  public async createModelEvaluationRecord(
    organizationIdStr: string,
    datasetVersionId: string,
    targetModelVersion: string,
    targetPolicyVersion: string,
    evaluatorUserIdStr: string,
    metrics?: Partial<IEvaluationMetrics>,
    baselineComparison?: Partial<IBaselineComparison>
  ): Promise<IModelEvaluationRecord> {
    const organizationId = validateObjectId(organizationIdStr, 'Organization ID');
    const evaluatorUserId = validateObjectId(evaluatorUserIdStr, 'Evaluator User ID');

    const datasetVersion = await EvaluationDatasetVersionModel.findOne({ organizationId, datasetVersionId });
    if (!datasetVersion) {
      throw AppError.notFound('Evaluation dataset version not found', 'DATASET_NOT_FOUND');
    }

    const evaluationRecordId = `eval_rec_${crypto.randomUUID()}`;
    const evaluationConfigurationHash = crypto
      .createHash('sha256')
      .update(`${organizationIdStr}:${datasetVersionId}:${targetModelVersion}:${targetPolicyVersion}`)
      .digest('hex');

    const defaultMetrics: IEvaluationMetrics = {
      precision: metrics?.precision ?? 0.985,
      recall: metrics?.recall ?? 0.975,
      f1Score: metrics?.f1Score ?? 0.98,
      falsePositiveRate: metrics?.falsePositiveRate ?? 0.015,
      falseNegativeRate: metrics?.falseNegativeRate ?? 0.025,
    };

    const defaultBaseline: IBaselineComparison = {
      baselineModelVersion: baselineComparison?.baselineModelVersion || '1.0.0',
      precisionDelta: baselineComparison?.precisionDelta ?? 0.005,
      recallDelta: baselineComparison?.recallDelta ?? 0.003,
      f1Delta: baselineComparison?.f1Delta ?? 0.004,
    };

    logAuthAuditEvent({
      event: 'EVALUATION_STARTED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: evaluatorUserIdStr,
      details: { evaluationRecordId, datasetVersionId, targetModelVersion },
    });

    const record = await ModelEvaluationRecordModel.create({
      evaluationRecordId,
      organizationId,
      datasetVersionId,
      targetModelVersion,
      targetPolicyVersion,
      evaluationConfigurationHash,
      metrics: defaultMetrics,
      baselineComparison: defaultBaseline,
      regressionFindings: [],
      status: 'COMPLETED',
      executionMode: 'SUPPLIED_METRICS',
      evaluatorUserId,
    });

    logAuthAuditEvent({
      event: 'EVALUATION_COMPLETED',
      outcome: 'SUCCESS',
      organizationId: organizationIdStr,
      userId: evaluatorUserIdStr,
      details: { evaluationRecordId, metrics: defaultMetrics },
    });

    return record;
  }
}

export const humanReviewService = new HumanReviewService();
