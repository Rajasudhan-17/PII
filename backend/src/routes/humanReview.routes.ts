import { Router } from 'express';
import { humanReviewController } from '../controllers/humanReview.controller';
import { authenticate } from '../middleware/authenticate';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { requireTenantRole } from '../middleware/authorizeTenant';
import { requirePermission } from '../middleware/authorize';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(tenantContextMiddleware);

// --- Review Cases Endpoints ---
router.post(
  '/review-cases',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('REVIEW_EXECUTE'),
  humanReviewController.createReviewCase
);

router.get(
  '/review-cases',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('REVIEW_READ'),
  humanReviewController.getReviewCases
);

router.get(
  '/review-cases/:caseId',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'),
  requirePermission('REVIEW_READ'),
  humanReviewController.getReviewCaseById
);

router.post(
  '/review-cases/:caseId/assign',
  requireTenantRole('ORG_ADMIN', 'REVIEWER'),
  requirePermission('REVIEW_ASSIGN'),
  humanReviewController.assignReviewer
);

router.post(
  '/review-cases/:caseId/claim',
  requireTenantRole('ORG_ADMIN', 'REVIEWER'),
  requirePermission('REVIEW_EXECUTE'),
  humanReviewController.claimCaseLease
);

router.post(
  '/review-cases/:caseId/decisions',
  requireTenantRole('ORG_ADMIN', 'REVIEWER'),
  requirePermission('REVIEW_EXECUTE'),
  humanReviewController.submitReviewDecision
);

// --- Feedback Endpoints ---
router.post(
  '/feedback',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST'),
  requirePermission('FEEDBACK_SUBMIT'),
  humanReviewController.submitFeedback
);

router.get(
  '/feedback',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST'),
  requirePermission('FEEDBACK_READ'),
  humanReviewController.getFeedback
);

router.post(
  '/feedback/:feedbackId/approve',
  requireTenantRole('ORG_ADMIN'),
  requirePermission('FEEDBACK_APPROVE'),
  humanReviewController.approveOrRejectFeedback
);

// --- Evaluation Datasets & Records Endpoints ---
router.post(
  '/datasets',
  requireTenantRole('ORG_ADMIN'),
  requirePermission('EVALUATION_EXECUTE'),
  humanReviewController.createDatasetVersion
);

router.get(
  '/datasets',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST'),
  requirePermission('EVALUATION_READ'),
  humanReviewController.getDatasetVersions
);

router.post(
  '/evaluations',
  requireTenantRole('ORG_ADMIN'),
  requirePermission('EVALUATION_EXECUTE'),
  humanReviewController.createModelEvaluationRecord
);

router.get(
  '/evaluations',
  requireTenantRole('ORG_ADMIN', 'REVIEWER', 'ANALYST'),
  requirePermission('EVALUATION_READ'),
  humanReviewController.getEvaluationRecords
);

export default router;
