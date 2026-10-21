import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import organizationRoutes from './organization.routes';
import documentRoutes from './document.routes';
import { extractionRouter } from './extraction.routes';
import { ocrRouter } from './ocr.routes';
import { piiRouter } from './pii.routes';
import { contextRouter } from './context.routes';
import { orgPolicyRouter, docDecisionRouter } from './policy.routes';
import transformationRoutes from './transformation.routes';
import sanitizationRoutes from './sanitization.routes';
import riskRoutes from './risk.routes';
import verificationRoutes from './verification.routes';
import humanReviewRoutes from './humanReview.routes';
import scanRoutes from './scan.routes';
import { authenticate } from '../middleware/authenticate';
import { requireRole, requirePermission } from '../middleware/authorize';

const router = Router();

// Health Routes
router.use('/', healthRoutes);

// Universal Scan & OCR Routes (Fast extraction for PDF, Images, DOCX, CSV)
router.use('/scan', scanRoutes);

// Authentication & Identity Routes
router.use('/auth', authRoutes);

// Multi-Tenancy & Organization Management Routes
router.use('/organizations', organizationRoutes);

// Tenant-Scoped Policy Management Routes
router.use('/organizations/:organizationId/policies', orgPolicyRouter);

// Tenant-Scoped Document Ingestion & Storage Routes
router.use('/organizations/:organizationId/documents', documentRoutes);

// Tenant-Scoped Document Extraction & Intelligence Routes
router.use('/organizations/:organizationId/documents/:documentId', extractionRouter);

// Tenant-Scoped OCR & HTR Routes
router.use('/organizations/:organizationId/documents/:documentId', ocrRouter);

// Tenant-Scoped PII Detection Routes
router.use('/organizations/:organizationId/documents/:documentId', piiRouter);

// Tenant-Scoped Contextual Intelligence Routes
router.use('/organizations/:organizationId/documents/:documentId', contextRouter);

// Tenant-Scoped Policy Decision Routes
router.use('/organizations/:organizationId/documents/:documentId', docDecisionRouter);

// Tenant-Scoped Redaction & Mutation Routes
router.use('/organizations/:organizationId/documents/:documentId/transformations', transformationRoutes);

// Tenant-Scoped Metadata & Hidden-Data Sanitization Routes
router.use('/organizations/:organizationId/documents/:documentId/sanitization', sanitizationRoutes);

// Tenant-Scoped Re-Identification Risk Engine Routes
router.use('/organizations/:organizationId/documents/:documentId/risk-analysis', riskRoutes);

// Tenant-Scoped Independent Verification & QA Engine Routes
router.use('/organizations/:organizationId/documents/:documentId/verification', verificationRoutes);

// Tenant-Scoped Phase 14 Human Review, Feedback & Evaluation Routes
router.use('/organizations/:organizationId', humanReviewRoutes);

// Test Endpoints for RBAC Verification (only exposed in test environment)
if (process.env.NODE_ENV === 'test') {
  router.get('/test/admin-only', authenticate, requireRole('ORG_ADMIN', 'SUPER_ADMIN'), (_req, res) => {
    res.status(200).json({ status: 'admin_access_granted' });
  });

  router.get('/test/user-manage-perm', authenticate, requirePermission('USER_MANAGE'), (_req, res) => {
    res.status(200).json({ status: 'perm_access_granted' });
  });
}

export default router;
