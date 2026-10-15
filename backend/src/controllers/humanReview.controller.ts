import { Request, Response, NextFunction } from 'express';
import { humanReviewService } from '../services/humanReview/humanReview.service';
import { ReviewFeedbackModel } from '../models/reviewFeedback.model';
import { EvaluationDatasetVersionModel } from '../models/evaluationDatasetVersion.model';
import { ModelEvaluationRecordModel } from '../models/modelEvaluationRecord.model';
import { ReviewCaseStatus, ReviewCasePriority } from '../models/humanReviewCase.model';
import { AppError } from '../utils/AppError';
import { validateObjectId } from '../utils/tenantQuery';

export class HumanReviewController {
  // 1. POST /api/v1/organizations/:organizationId/review-cases
  public async createReviewCase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId } = req.params;
      const {
        documentId,
        verificationRunId,
        verificationResultIds,
        sanitizedArtifactId,
        sanitizedArtifactChecksum,
        caseType,
        priority,
        severity,
        reasonCodes,
        safeEvidenceReferences,
        reviewDeadline,
      } = req.body;

      if (!documentId) {
        throw AppError.badRequest('documentId is required', 'MISSING_DOCUMENT_ID');
      }

      const reviewCase = await humanReviewService.createReviewCase({
        organizationIdStr: organizationId,
        documentIdStr: documentId,
        verificationRunId,
        verificationResultIds,
        sanitizedArtifactId,
        sanitizedArtifactChecksum,
        caseType,
        priority,
        severity,
        reasonCodes,
        safeEvidenceReferences,
        reviewDeadline: reviewDeadline ? new Date(reviewDeadline) : undefined,
        createdByUserIdStr: req.user?.id,
      });

      res.status(201).json({
        status: 'SUCCESS',
        data: { reviewCase },
      });
    } catch (err) {
      next(err);
    }
  }

  // 2. GET /api/v1/organizations/:organizationId/review-cases
  public async getReviewCases(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { status, priority, assignedReviewerId, page, limit } = req.query;

      const result = await humanReviewService.getReviewCases(organizationId, {
        status: status ? (status as ReviewCaseStatus) : undefined,
        priority: priority ? (priority as ReviewCasePriority) : undefined,
        assignedReviewerIdStr: assignedReviewerId ? String(assignedReviewerId) : undefined,
        page: page ? parseInt(String(page), 10) : 1,
        limit: limit ? parseInt(String(limit), 10) : 20,
      });

      res.status(200).json({
        status: 'SUCCESS',
        data: {
          cases: result.cases,
          pagination: {
            total: result.total,
            page: page ? parseInt(String(page), 10) : 1,
            limit: limit ? parseInt(String(limit), 10) : 20,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // 3. GET /api/v1/organizations/:organizationId/review-cases/:caseId
  public async getReviewCaseById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, caseId } = req.params;
      const result = await humanReviewService.getReviewCaseById(organizationId, caseId);

      res.status(200).json({
        status: 'SUCCESS',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  // 4. POST /api/v1/organizations/:organizationId/review-cases/:caseId/assign
  public async assignReviewer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, caseId } = req.params;
      const { targetReviewerId, allowSelfAssignment } = req.body;

      if (!targetReviewerId) {
        throw AppError.badRequest('targetReviewerId is required', 'MISSING_REVIEWER_ID');
      }

      const reviewCase = await humanReviewService.assignReviewer(
        organizationId,
        caseId,
        targetReviewerId,
        req.user?.id || '',
        Boolean(allowSelfAssignment)
      );

      res.status(200).json({
        status: 'SUCCESS',
        data: { reviewCase },
      });
    } catch (err) {
      next(err);
    }
  }

  // 5. POST /api/v1/organizations/:organizationId/review-cases/:caseId/claim
  public async claimCaseLease(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, caseId } = req.params;

      const reviewCase = await humanReviewService.claimCaseLease(
        organizationId,
        caseId,
        req.user?.id || ''
      );

      res.status(200).json({
        status: 'SUCCESS',
        data: { reviewCase },
      });
    } catch (err) {
      next(err);
    }
  }

  // 6. POST /api/v1/organizations/:organizationId/review-cases/:caseId/decisions
  public async submitReviewDecision(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, caseId } = req.params;
      const {
        decisionType,
        reasonCode,
        safeRationale,
        safeEvidenceReferences,
        expectedNextAction,
        caseVersion,
      } = req.body;

      if (!decisionType || !reasonCode || !safeRationale || caseVersion === undefined) {
        throw AppError.badRequest('decisionType, reasonCode, safeRationale, and caseVersion are required', 'MISSING_FIELDS');
      }

      const result = await humanReviewService.submitReviewDecision({
        organizationIdStr: organizationId,
        reviewCaseIdStr: caseId,
        reviewerIdStr: req.user?.id || '',
        decisionType,
        reasonCode,
        safeRationale,
        safeEvidenceReferences,
        expectedNextAction,
        caseVersion: parseInt(String(caseVersion), 10),
      });

      res.status(201).json({
        status: 'SUCCESS',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  // 7. POST /api/v1/organizations/:organizationId/feedback
  public async submitFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId } = req.params;
      const {
        reviewCaseId,
        reviewDecisionId,
        feedbackCategory,
        sourceDecisionReference,
        reviewedOutcome,
        provenance,
      } = req.body;

      if (!reviewCaseId || !reviewDecisionId || !feedbackCategory || !sourceDecisionReference || !reviewedOutcome) {
        throw AppError.badRequest('Missing required feedback fields', 'MISSING_FIELDS');
      }

      const feedback = await humanReviewService.submitFeedback(
        organizationId,
        reviewCaseId,
        reviewDecisionId,
        req.user?.id || '',
        feedbackCategory,
        sourceDecisionReference,
        reviewedOutcome,
        provenance
      );

      res.status(201).json({
        status: 'SUCCESS',
        data: { feedback },
      });
    } catch (err) {
      next(err);
    }
  }

  // 8. GET /api/v1/organizations/:organizationId/feedback
  public async getFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId } = req.params;
      const orgId = validateObjectId(organizationId, 'Organization ID');
      const feedbackList = await ReviewFeedbackModel.find({ organizationId: orgId }).sort({ createdAt: -1 });

      res.status(200).json({
        status: 'SUCCESS',
        data: { feedback: feedbackList },
      });
    } catch (err) {
      next(err);
    }
  }

  // 9. POST /api/v1/organizations/:organizationId/feedback/:feedbackId/approve
  public async approveOrRejectFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, feedbackId } = req.params;
      const { approve, approvalNotes } = req.body;

      if (approve === undefined) {
        throw AppError.badRequest('approve field (boolean) is required', 'MISSING_APPROVE_BOOLEAN');
      }

      const feedback = await humanReviewService.approveOrRejectFeedback(
        organizationId,
        feedbackId,
        req.user?.id || '',
        Boolean(approve),
        approvalNotes
      );

      res.status(200).json({
        status: 'SUCCESS',
        data: { feedback },
      });
    } catch (err) {
      next(err);
    }
  }

  // 10. POST /api/v1/organizations/:organizationId/datasets
  public async createDatasetVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { versionName } = req.body;

      if (!versionName) {
        throw AppError.badRequest('versionName is required', 'MISSING_VERSION_NAME');
      }

      const datasetVersion = await humanReviewService.createDatasetVersion(
        organizationId,
        versionName,
        req.user?.id || ''
      );

      res.status(201).json({
        status: 'SUCCESS',
        data: { datasetVersion },
      });
    } catch (err) {
      next(err);
    }
  }

  // 11. GET /api/v1/organizations/:organizationId/datasets
  public async getDatasetVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId } = req.params;
      const orgId = validateObjectId(organizationId, 'Organization ID');
      const datasets = await EvaluationDatasetVersionModel.find({ organizationId: orgId }).sort({ createdAt: -1 });

      res.status(200).json({
        status: 'SUCCESS',
        data: { datasets },
      });
    } catch (err) {
      next(err);
    }
  }

  // 12. POST /api/v1/organizations/:organizationId/evaluations
  public async createModelEvaluationRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId } = req.params;
      const {
        datasetVersionId,
        targetModelVersion,
        targetPolicyVersion,
        metrics,
        baselineComparison,
      } = req.body;

      if (!datasetVersionId || !targetModelVersion || !targetPolicyVersion) {
        throw AppError.badRequest('datasetVersionId, targetModelVersion, and targetPolicyVersion are required', 'MISSING_FIELDS');
      }

      const evaluationRecord = await humanReviewService.createModelEvaluationRecord(
        organizationId,
        datasetVersionId,
        targetModelVersion,
        targetPolicyVersion,
        req.user?.id || '',
        metrics,
        baselineComparison
      );

      res.status(201).json({
        status: 'SUCCESS',
        data: { evaluationRecord },
      });
    } catch (err) {
      next(err);
    }
  }

  // 13. GET /api/v1/organizations/:organizationId/evaluations
  public async getEvaluationRecords(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId } = req.params;
      const orgId = validateObjectId(organizationId, 'Organization ID');
      const evaluations = await ModelEvaluationRecordModel.find({ organizationId: orgId }).sort({ createdAt: -1 });

      res.status(200).json({
        status: 'SUCCESS',
        data: { evaluations },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const humanReviewController = new HumanReviewController();
