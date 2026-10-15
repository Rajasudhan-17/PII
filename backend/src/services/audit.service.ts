import { logger } from '../utils/logger';

export type AuthAuditEventType =
  | 'AUTH_REGISTER_SUCCESS'
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILURE'
  | 'AUTH_LOGOUT'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'AUTH_TOKEN_REFRESHED'
  | 'AUTH_TOKEN_REVOKED'
  | 'AUTH_TOKEN_REUSE_DETECTED'
  | 'AUTH_ACCESS_DENIED'
  // Phase 03 Tenant Audit Events
  | 'ORGANIZATION_CREATED'
  | 'ORGANIZATION_UPDATED'
  | 'ORGANIZATION_SUSPENDED'
  | 'ORGANIZATION_DISABLED'
  | 'MEMBER_ADDED'
  | 'MEMBER_ROLE_CHANGED'
  | 'MEMBER_SUSPENDED'
  | 'MEMBER_REMOVED'
  | 'TENANT_ACCESS_DENIED'
  // Phase 04 Document Security Audit Events
  | 'DOCUMENT_UPLOAD_STARTED'
  | 'DOCUMENT_UPLOAD_ACCEPTED'
  | 'DOCUMENT_UPLOAD_REJECTED'
  | 'DOCUMENT_DOWNLOAD'
  | 'DOCUMENT_DELETED'
  | 'DOCUMENT_ACCESS_DENIED'
  // Phase 05 Document Extraction Audit Events
  | 'DOCUMENT_EXTRACTION_QUEUED'
  | 'DOCUMENT_EXTRACTION_STARTED'
  | 'DOCUMENT_EXTRACTION_COMPLETED'
  | 'DOCUMENT_EXTRACTION_PARTIAL'
  | 'DOCUMENT_EXTRACTION_FAILED'
  // Phase 06 OCR & HTR Audit Events
  | 'DOCUMENT_OCR_QUEUED'
  | 'DOCUMENT_OCR_STARTED'
  | 'DOCUMENT_OCR_COMPLETED'
  | 'DOCUMENT_OCR_PARTIAL'
  | 'DOCUMENT_OCR_FAILED'
  | 'DOCUMENT_HTR_QUEUED'
  | 'DOCUMENT_HTR_STARTED'
  | 'DOCUMENT_HTR_COMPLETED'
  | 'DOCUMENT_HTR_PARTIAL'
  | 'DOCUMENT_HTR_FAILED'
  // Phase 07 PII Detection Audit Events
  | 'PII_DETECTION_QUEUED'
  | 'PII_DETECTION_STARTED'
  | 'PII_DETECTION_COMPLETED'
  | 'PII_DETECTION_FAILED'
  // Phase 08 Context Analysis Audit Events
  | 'CONTEXT_ANALYSIS_QUEUED'
  | 'CONTEXT_ANALYSIS_STARTED'
  | 'CONTEXT_ANALYSIS_COMPLETED'
  | 'CONTEXT_ANALYSIS_PARTIAL'
  | 'CONTEXT_ANALYSIS_FAILED'
  // Phase 09 Policy & Decision Audit Events
  | 'POLICY_CREATED'
  | 'POLICY_VERSION_CREATED'
  | 'POLICY_PUBLISHED'
  | 'DECISION_EVALUATION_QUEUED'
  | 'DECISION_EVALUATION_STARTED'
  | 'DECISION_EVALUATION_COMPLETED'
  | 'DECISION_EVALUATION_PARTIAL'
  | 'DECISION_EVALUATION_FAILED'
  // Phase 10 Redaction & Mutation Audit Events
  | 'TRANSFORMATION_QUEUED'
  | 'TRANSFORMATION_STARTED'
  | 'TRANSFORMATION_COMPLETED'
  | 'TRANSFORMATION_PARTIAL'
  | 'TRANSFORMATION_FAILED'
  | 'REDACTION_APPLIED'
  | 'MUTATION_APPLIED'
  | 'TRANSFORMATION_STALE_SOURCE'
  | 'TRANSFORMATION_OUTPUT_CREATED'
  // Phase 11 Metadata & Hidden-Data Sanitization Audit Events
  | 'SANITIZATION_QUEUED'
  | 'SANITIZATION_STARTED'
  | 'SANITIZATION_COMPLETED'
  | 'SANITIZATION_PARTIAL'
  | 'SANITIZATION_FAILED'
  | 'METADATA_DISCOVERED'
  | 'METADATA_SANITY_REMOVED'
  | 'METADATA_SANITY_PRESERVED'
  | 'UNSUPPORTED_METADATA_DETECTED'
  | 'SANITIZATION_VERIFICATION_PASSED'
  | 'SANITIZATION_VERIFICATION_FAILED'
  | 'SANITIZED_ARTIFACT_PUBLISHED'
  | 'SANITIZED_ARTIFACT_REJECTED'
  // Phase 12 Re-Identification Risk Engine Audit Events
  | 'RISK_ANALYSIS_REQUESTED'
  | 'RISK_ANALYSIS_QUEUED'
  | 'RISK_ANALYSIS_STARTED'
  | 'RISK_ANALYSIS_COMPLETED'
  | 'RISK_ANALYSIS_FAILED'
  | 'HIGH_RISK_DETECTED'
  | 'CRITICAL_RISK_DETECTED'
  | 'RISK_ARTIFACT_REJECTED'
  // Phase 13 Verification & Quality Assurance Audit Events
  | 'VERIFICATION_REQUESTED'
  | 'VERIFICATION_QUEUED'
  | 'VERIFICATION_STARTED'
  | 'VERIFICATION_COMPLETED'
  | 'VERIFICATION_FAILED'
  | 'VERIFICATION_PUBLISHED'
  | 'VERIFICATION_INTEGRITY_FAILURE'
  | 'VERIFICATION_REJECTED'
  // Phase 14 Human Review, Adaptive Learning & Audit Events
  | 'REVIEW_CASE_CREATED'
  | 'REVIEW_CASE_ASSIGNED'
  | 'REVIEW_CASE_REASSIGNED'
  | 'REVIEW_CASE_CLAIMED'
  | 'REVIEW_STARTED'
  | 'REVIEW_DECISION_SUBMITTED'
  | 'REVIEW_SECOND_REVIEW_REQUESTED'
  | 'REVIEW_ESCALATED'
  | 'REVIEW_CASE_RESOLVED'
  | 'FEEDBACK_SUBMITTED'
  | 'FEEDBACK_APPROVED'
  | 'FEEDBACK_REJECTED'
  | 'DATASET_VERSION_CREATED'
  | 'EVALUATION_STARTED'
  | 'EVALUATION_COMPLETED'
  // Phase 15 Production Hardening & Advanced Modalities Audit Events
  | 'MEDIA_PROCESSING_STARTED'
  | 'MEDIA_PROCESSING_COMPLETED'
  | 'MEDIA_PROCESSING_FAILED'
  | 'MEDIA_PROCESSING_DENIED';

export interface AuditEventPayload {
  event: AuthAuditEventType;
  userId?: string;
  organizationId?: string;
  requestId?: string;
  ip?: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED' | 'LOCKED';
  reason?: string;
  details?: Record<string, unknown>;
}

export const logAuthAuditEvent = (payload: AuditEventPayload): void => {
  const logData = {
    event: payload.event,
    timestamp: new Date().toISOString(),
    userId: payload.userId || 'anonymous',
    organizationId: payload.organizationId || 'none',
    requestId: payload.requestId || 'unknown',
    ip: payload.ip || 'unknown',
    outcome: payload.outcome,
    reason: payload.reason,
    ...payload.details,
  };

  if (payload.outcome === 'SUCCESS') {
    logger.info(logData, `Security Audit: ${payload.event} [${payload.outcome}]`);
  } else {
    logger.warn(logData, `Security Audit: ${payload.event} [${payload.outcome}] - ${payload.reason || 'No reason provided'}`);
  }
};
