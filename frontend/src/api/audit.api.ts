import { AuditEventTaxonomyItem } from '../types/audit';

export const AUDIT_EVENT_TAXONOMY: AuditEventTaxonomyItem[] = [
  // 1. Auth & Session
  {
    event: 'AUTH_REGISTER_SUCCESS',
    category: 'Identity',
    phase: 'Authentication',
    description: 'User identity successfully provisioned with salted credentials.',
    complianceRelevance: 'Account provenance and identity lifecycle tracking (SOC 2 CC6.1)',
  },
  {
    event: 'AUTH_LOGIN_SUCCESS',
    category: 'Identity',
    phase: 'Authentication',
    description: 'User successfully authenticated and issued dual-token credentials.',
    complianceRelevance: 'Access log monitoring and session initiation (ISO 27001 A.9.4)',
  },
  {
    event: 'AUTH_LOGIN_FAILURE',
    category: 'Security',
    phase: 'Authentication',
    description: 'Invalid credentials or non-existent account login attempt.',
    complianceRelevance: 'Brute force and credential stuffing intrusion detection (SOC 2 CC6.8)',
  },
  {
    event: 'AUTH_ACCOUNT_LOCKED',
    category: 'Security',
    phase: 'Authentication',
    description: 'Account automatically locked due to excessive failed attempts.',
    complianceRelevance: 'Account lockout threshold enforcement (NIST SP 800-53 AC-7)',
  },
  {
    event: 'AUTH_TOKEN_REFRESHED',
    category: 'Identity',
    phase: 'Authentication',
    description: 'Refresh token rotated and replacement access token issued.',
    complianceRelevance: 'Token replay defense and session renewal verification',
  },
  {
    event: 'AUTH_TOKEN_REVOKED',
    category: 'Identity',
    phase: 'Authentication',
    description: 'User session or refresh token explicitly revoked during logout.',
    complianceRelevance: 'Session termination and credential invalidation (GDPR Art. 32)',
  },
  {
    event: 'AUTH_TOKEN_REUSE_DETECTED',
    category: 'Security',
    phase: 'Authentication',
    description: 'Attempt to exchange an already-revoked refresh token detected.',
    complianceRelevance: 'Token theft detection and immediate session invalidation',
  },
  {
    event: 'AUTH_ACCESS_DENIED',
    category: 'Authorization',
    phase: 'Authentication',
    description: 'Access denied due to missing or invalid bearer token credentials.',
    complianceRelevance: 'Unauthorized perimeter request detection (SOC 2 CC6.1)',
  },

  // 2. Tenant & Membership
  {
    event: 'ORGANIZATION_CREATED',
    category: 'Tenancy',
    phase: 'Multi-Tenancy',
    description: 'New tenant organization provisioned with isolated data namespace.',
    complianceRelevance: 'Tenant onboarding and isolation boundary establishment',
  },
  {
    event: 'MEMBER_ADDED',
    category: 'Tenancy',
    phase: 'Multi-Tenancy',
    description: 'User granted role membership in tenant organization.',
    complianceRelevance: 'Privilege allocation audit trail (ISO 27001 A.9.2)',
  },
  {
    event: 'MEMBER_ROLE_CHANGED',
    category: 'Tenancy',
    phase: 'Multi-Tenancy',
    description: 'User organizational role mutated (e.g., MEMBER to REVIEWER or ORG_ADMIN).',
    complianceRelevance: 'Privilege escalation monitoring (SOC 2 CC6.3)',
  },
  {
    event: 'TENANT_ACCESS_DENIED',
    category: 'Security',
    phase: 'Multi-Tenancy',
    description: 'Cross-tenant request blocked by tenant boundary middleware.',
    complianceRelevance: 'Tenant data isolation enforcement (HIPAA Security Rule §164.312)',
  },

  // 3. Document Lifecycle
  {
    event: 'DOCUMENT_UPLOAD_ACCEPTED',
    category: 'Ingestion',
    phase: 'Document Lifecycle',
    description: 'File accepted following magic-byte validation and SHA-256 calculation.',
    complianceRelevance: 'Cryptographic document chain of custody initiation',
  },
  {
    event: 'DOCUMENT_UPLOAD_REJECTED',
    category: 'Security',
    phase: 'Document Lifecycle',
    description: 'Upload rejected due to file size, disallowed extension, or spoofed MIME type.',
    complianceRelevance: 'Malicious payload injection and input validation defense',
  },
  {
    event: 'DOCUMENT_DOWNLOAD',
    category: 'Storage',
    phase: 'Document Lifecycle',
    description: 'Original immutable document stream accessed by authorized user.',
    complianceRelevance: 'Data retrieval tracking for sensitive records (GDPR Art. 30)',
  },
  {
    event: 'DOCUMENT_DELETED',
    category: 'Storage',
    phase: 'Document Lifecycle',
    description: 'Document record marked as soft-deleted by organization administrator.',
    complianceRelevance: 'Right to erasure and document lifecycle disposal tracking',
  },

  // 4. Intelligence & Detection
  {
    event: 'DOCUMENT_EXTRACTION_COMPLETED',
    category: 'Extraction',
    phase: 'Processing',
    description: 'Native document normalized into text stream and structural blocks.',
    complianceRelevance: 'Data parsing integrity and parser verification',
  },
  {
    event: 'PII_DETECTION_COMPLETED',
    category: 'PII Engine',
    phase: 'Detection',
    description: 'Presidio, regex, and NER detectors evaluated candidate findings.',
    complianceRelevance: 'Sensitive identifier discovery audit trail (ISO 27701 7.2.5)',
  },
  {
    event: 'DECISION_EVALUATION_COMPLETED',
    category: 'Policy',
    phase: 'Policy Engine',
    description: 'Deterministic rules evaluated candidates to KEEP, REVIEW, or REDACT.',
    complianceRelevance: 'Algorithmic policy enforcement transparency and explainability',
  },

  // 5. Transformations & Sanitization
  {
    event: 'TRANSFORMATION_COMPLETED',
    category: 'Redaction',
    phase: 'Transformation',
    description: 'Physical mutations applied; separate OutputArtifact SHA-256 generated.',
    complianceRelevance: 'Cryptographic transformation provenance (FIPS 140-3)',
  },
  {
    event: 'SANITIZED_ARTIFACT_PUBLISHED',
    category: 'Sanitization',
    phase: 'Metadata Sanitization',
    description: 'Metadata, EXIF, and hidden revisions permanently purged.',
    complianceRelevance: 'Hidden information disclosure prevention (NIST SP 800-88)',
  },

  // 6. Risk & Independent Verification
  {
    event: 'HIGH_RISK_DETECTED',
    category: 'Risk',
    phase: 'Re-Identification Risk',
    description: 'Residual attribute uniqueness generated elevated re-identification risk.',
    complianceRelevance: 'De-identification risk threshold alerting (HIPAA Expert Determination)',
  },
  {
    event: 'CRITICAL_RISK_DETECTED',
    category: 'Risk',
    phase: 'Re-Identification Risk',
    description: 'Residual direct identifiers detected in post-transformation inspection.',
    complianceRelevance: 'Critical privacy violation safeguard and release prevention',
  },
  {
    event: 'VERIFICATION_COMPLETED',
    category: 'QA Verification',
    phase: 'Independent QA',
    description: '9-verifier multi-engine inspection concluded against transformed output.',
    complianceRelevance: 'Dual-engine QA compliance and independent release verification',
  },
  {
    event: 'VERIFICATION_INTEGRITY_FAILURE',
    category: 'Security',
    phase: 'Independent QA',
    description: 'Source or output disk file altered upstream; checksum mismatch.',
    complianceRelevance: 'Tamper-evident artifact integrity defense',
  },

  // 7. Human Review
  {
    event: 'REVIEW_CASE_CREATED',
    category: 'Human Review',
    phase: 'Adjudication',
    description: 'Ambiguous policy candidate queued for human review adjudication.',
    complianceRelevance: 'Human-in-the-loop oversight workflow (EU AI Act Art. 14)',
  },
  {
    event: 'REVIEW_CASE_CLAIMED',
    category: 'Human Review',
    phase: 'Adjudication',
    description: 'Authorized reviewer acquired 15-minute atomic concurrency lease.',
    complianceRelevance: 'Reviewer contention control and multi-analyst conflict prevention',
  },
  {
    event: 'REVIEW_DECISION_SUBMITTED',
    category: 'Human Review',
    phase: 'Adjudication',
    description: 'Human adjudication decision persisted with audited safe rationale.',
    complianceRelevance: 'Expert review accountability and non-repudiation',
  },
  {
    event: 'REVIEW_SECOND_REVIEW_REQUESTED',
    category: 'Human Review',
    phase: 'Adjudication',
    description: 'Second independent reviewer arbitration requested; self-approval prohibited.',
    complianceRelevance: 'Dual-control governance for critical privacy decisions',
  },
  {
    event: 'REVIEW_CASE_RESOLVED',
    category: 'Human Review',
    phase: 'Adjudication',
    description: 'Review case finalized and unblocking publication release invariants.',
    complianceRelevance: 'Privacy certification release authorization',
  },
];

export const auditApi = {
  getTaxonomy: (): AuditEventTaxonomyItem[] => AUDIT_EVENT_TAXONOMY,
};
