export type OverallVerificationStatus = 'VERIFIED' | 'FAILED' | 'PARTIAL' | 'NOT_VERIFIABLE';
export type VerificationRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

// Backward compatibility alias
export type VerificationStatus = OverallVerificationStatus;

export type VerifierType =
  | 'CHECKSUM_VERIFIER'
  | 'ARTIFACT_INTEGRITY_VERIFIER'
  | 'STRUCTURAL_INTEGRITY_VERIFIER'
  | 'TRANSFORMATION_VERIFIER'
  | 'METADATA_VERIFIER'
  | 'PII_RESIDUAL_VERIFIER'
  | 'POLICY_VERIFIER'
  | 'PROVENANCE_VERIFIER'
  | 'RISK_CONSISTENCY_VERIFIER'
  | string;

export type VerifierSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface VerificationResultItem {
  _id?: string;
  verificationResultId: string;
  verificationRunId: string;
  organizationId?: string;
  documentId?: string;
  sourceArtifactId?: string;
  outputArtifactId?: string;
  verifierType: VerifierType;
  status: OverallVerificationStatus;
  severity: VerifierSeverity;
  passed: boolean;
  reasonCode: string;
  explanation: string;
  expected?: string | null;
  observed?: string | null;
  findingsCount: number;
  warnings?: string[];
  verifierVersion?: string;
  createdAt?: string;
}

export interface VerificationRun {
  _id?: string;
  verificationRunId: string;
  organizationId: string;
  documentId: string;
  sourceArtifactId?: string;
  outputArtifactId?: string;
  sourceChecksum?: string;
  outputChecksum?: string;
  configurationVersion?: string;
  configurationHash?: string;
  verificationModelVersion?: string;
  status: VerificationRunStatus;
  overallStatus: OverallVerificationStatus | null;
  overallVerificationScore: number; // 0.00 to 1.00
  totalVerifierCount: number;
  passedVerifierCount: number;
  failedVerifierCount: number;
  unverifiableCount: number;
  isLatestActive?: boolean;
  failureReason?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  createdAt: string;
  results?: VerificationResultItem[];
}

export interface VerificationResultsResponse {
  success: boolean;
  data: {
    verificationRun: VerificationRun | null;
    results: VerificationResultItem[];
  };
}

export interface VerificationRunsResponse {
  success: boolean;
  data: {
    verificationRuns?: VerificationRun[];
    runs?: VerificationRun[];
  };
}
