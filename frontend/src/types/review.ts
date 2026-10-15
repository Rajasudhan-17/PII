export type ReviewCaseStatus =
  | 'OPEN'
  | 'QUEUED'
  | 'ASSIGNED'
  | 'IN_REVIEW'
  | 'AWAITING_SECOND_REVIEW'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'REJECTED'
  | 'CANCELLED'
  // Backward compatibility alias
  | 'PENDING_REVIEW'
  | 'ADJUDICATED';

export type ReviewCasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'CRITICAL';
export type ReviewCaseSeverity = 'INFO' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ReviewCaseType =
  | 'PARTIAL_VERIFICATION'
  | 'AMBIGUOUS_POLICY'
  | 'CONFLICTING_EVIDENCE'
  | 'HIGH_RISK_REVIEW'
  | 'CAPABILITY_UNAVAILABLE'
  | 'MANUAL_REQUEST';

export type ReviewDecisionType =
  | 'CONFIRM_FINDING'
  | 'REJECT_FALSE_POSITIVE'
  | 'CONFIRM_REDACTION'
  | 'REPORT_INCOMPLETE_REDACTION'
  | 'REQUEST_REPROCESSING'
  | 'REQUEST_SECOND_REVIEW'
  | 'ESCALATE'
  | 'INSUFFICIENT_EVIDENCE';

export interface SafeEvidenceReference {
  candidateId?: string;
  piiType?: string;
  locationLabel?: string;
  expectedAction?: string;
  observedState?: string;
  findingId?: string;
}

export interface HumanReviewCase {
  _id?: string;
  reviewCaseId: string;
  organizationId: string;
  documentId: string;
  verificationRunId?: string;
  verificationResultIds?: string[];
  sanitizedArtifactId?: string;
  sanitizedArtifactChecksum?: string;
  caseType: string;
  priority: ReviewCasePriority;
  severity: ReviewCaseSeverity;
  status: ReviewCaseStatus;
  assignedReviewerId?: string;
  assignmentVersion?: number;
  leaseOwnerId?: string;
  leaseExpiresAt?: string;
  reasonCodes: string[];
  safeEvidenceReferences: SafeEvidenceReference[];
  reviewDeadline?: string;
  caseVersion: number;
  createdByUserId?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ReviewDecision {
  _id?: string;
  reviewDecisionId: string;
  organizationId: string;
  reviewCaseId: string;
  reviewerId: string;
  decisionType: ReviewDecisionType;
  decisionSequence: number;
  isSecondReview: boolean;
  reasonCode: string;
  safeRationale: string;
  safeEvidenceReferences?: SafeEvidenceReference[];
  expectedNextAction: string;
  caseVersion: number;
  createdAt: string;
  updatedAt?: string;
}

export interface SubmitReviewDecisionPayload {
  decisionType: ReviewDecisionType;
  reasonCode: string;
  safeRationale: string;
  safeEvidenceReferences?: SafeEvidenceReference[];
  expectedNextAction?: string;
  caseVersion: number;
}

export type AdjudicationInput = SubmitReviewDecisionPayload;

export interface ReviewCasesQuery {
  status?: string;
  priority?: string;
  assignedReviewerId?: string;
  page?: number;
  limit?: number;
}

export interface ReviewCasesResponse {
  status: 'SUCCESS' | 'ERROR';
  data: {
    cases: HumanReviewCase[];
    pagination?: {
      total: number;
      page: number;
      limit: number;
    };
  };
}

export interface ReviewCaseDetailsResponse {
  status: 'SUCCESS' | 'ERROR';
  data: {
    reviewCase: HumanReviewCase;
    decisions: ReviewDecision[];
    notifications: unknown[];
  };
}
