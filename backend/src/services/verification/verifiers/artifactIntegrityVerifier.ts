import { OverallVerificationStatus } from '../../../models/verificationRun.model';
import { VerifierSeverity } from '../../../models/verificationResult.model';

export interface ArtifactIntegrityOutcome {
  verifierType: 'ARTIFACT_INTEGRITY_VERIFIER';
  status: OverallVerificationStatus;
  severity: VerifierSeverity;
  passed: boolean;
  reasonCode: string;
  explanation: string;
  expected: string | null;
  observed: string | null;
  findingsCount: number;
  warnings: string[];
}

export class ArtifactIntegrityVerifier {
  public static verify(params: {
    docOrgId: string;
    targetOrgId: string;
    docIsDeleted: boolean;
    sourceArtifactId: string;
    outputArtifactId: string;
  }): ArtifactIntegrityOutcome {
    const warnings: string[] = [];

    if (params.docOrgId !== params.targetOrgId) {
      return {
        verifierType: 'ARTIFACT_INTEGRITY_VERIFIER',
        status: 'FAILED',
        severity: 'CRITICAL',
        passed: false,
        reasonCode: 'TENANT_MISMATCH',
        explanation: 'Cross-tenant violation: Document organization ID does not match target tenant organization ID.',
        expected: params.targetOrgId,
        observed: params.docOrgId,
        findingsCount: 1,
        warnings: ['Cross-tenant organization ID mismatch detected.'],
      };
    }

    if (params.docIsDeleted) {
      return {
        verifierType: 'ARTIFACT_INTEGRITY_VERIFIER',
        status: 'FAILED',
        severity: 'HIGH',
        passed: false,
        reasonCode: 'DOCUMENT_DELETED',
        explanation: 'Target document has been soft-deleted.',
        expected: 'ACTIVE_DOCUMENT',
        observed: 'DELETED_DOCUMENT',
        findingsCount: 1,
        warnings: ['Document is marked as deleted.'],
      };
    }

    if (!params.sourceArtifactId || !params.outputArtifactId) {
      return {
        verifierType: 'ARTIFACT_INTEGRITY_VERIFIER',
        status: 'FAILED',
        severity: 'HIGH',
        passed: false,
        reasonCode: 'MISSING_ARTIFACT_IDENTIFIER',
        explanation: 'Missing required source or output artifact identifier.',
        expected: 'VALID_ARTIFACT_IDS',
        observed: 'MISSING_IDS',
        findingsCount: 1,
        warnings: ['Source or output artifact ID omitted.'],
      };
    }

    return {
      verifierType: 'ARTIFACT_INTEGRITY_VERIFIER',
      status: 'VERIFIED',
      severity: 'INFO',
      passed: true,
      reasonCode: 'ARTIFACT_INTEGRITY_VERIFIED',
      explanation: 'Artifact tenant boundaries, document state, and identity relationships verified cleanly.',
      expected: params.targetOrgId,
      observed: params.docOrgId,
      findingsCount: 0,
      warnings,
    };
  }
}
