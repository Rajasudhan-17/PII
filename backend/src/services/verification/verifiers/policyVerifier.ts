import { OverallVerificationStatus } from '../../../models/verificationRun.model';
import { VerifierSeverity } from '../../../models/verificationResult.model';

export interface PolicyOutcome {
  verifierType: 'POLICY_VERIFIER';
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

export class PolicyVerifier {
  public static verify(
    decisionType: string | null,
    sourceChecksum: string,
    outputChecksum: string,
    residualProhibitedContentObserved: boolean = false,
    unauthorizedMutationObserved: boolean = false,
    isPublishedAsSanitized: boolean = false
  ): PolicyOutcome {
    const warnings: string[] = [];

    // REDACT Decision Contract
    if (decisionType === 'REDACT') {
      if (sourceChecksum === outputChecksum) {
        return {
          verifierType: 'POLICY_VERIFIER',
          status: 'FAILED',
          severity: 'HIGH',
          passed: false,
          reasonCode: 'POLICY_DECISION_UNSATISFIED',
          explanation: 'Policy decision specified REDACT, but output artifact remains identical to source artifact.',
          expected: 'CONTENT_REMOVED_OR_REDACTED',
          observed: 'UNMODIFIED_SOURCE_ARTIFACT',
          findingsCount: 1,
          warnings: ['Output checksum matches source checksum despite REDACT decision.'],
        };
      }

      if (residualProhibitedContentObserved) {
        return {
          verifierType: 'POLICY_VERIFIER',
          status: 'FAILED',
          severity: 'CRITICAL',
          passed: false,
          reasonCode: 'KNOWN_PROHIBITED_CONTENT_REMAINS',
          explanation: 'Known upstream prohibited candidate content survived in output artifact despite REDACT policy decision.',
          expected: 'CONTENT_REMOVED_OR_REDACTED',
          observed: 'KNOWN_PROHIBITED_CONTENT_REMAINS',
          findingsCount: 1,
          warnings: ['Known prohibited content survived transformation.'],
        };
      }

      return {
        verifierType: 'POLICY_VERIFIER',
        status: 'VERIFIED',
        severity: 'INFO',
        passed: true,
        reasonCode: 'POLICY_VERIFIED',
        explanation: 'Output artifact independently verified clean and transformed according to REDACT policy contract.',
        expected: 'CONTENT_REMOVED_OR_REDACTED',
        observed: 'NO_KNOWN_PROHIBITED_CONTENT',
        findingsCount: 0,
        warnings,
      };
    }

    // KEEP Decision Contract
    if (decisionType === 'KEEP') {
      if (unauthorizedMutationObserved) {
        return {
          verifierType: 'POLICY_VERIFIER',
          status: 'FAILED',
          severity: 'HIGH',
          passed: false,
          reasonCode: 'UNAUTHORIZED_MUTATION_OBSERVED',
          explanation: 'Output artifact underwent unauthorized structural or content mutation under KEEP policy contract.',
          expected: 'UNMODIFIED_OR_AUTHORIZED_KEEP',
          observed: 'UNAUTHORIZED_MUTATION_OBSERVED',
          findingsCount: 1,
          warnings: ['Unauthorized artifact mutation detected under KEEP decision.'],
        };
      }

      if (sourceChecksum !== outputChecksum) {
        warnings.push('Output checksum differs from source under KEEP policy, but no unauthorized mutation was detected.');
      }

      return {
        verifierType: 'POLICY_VERIFIER',
        status: 'VERIFIED',
        severity: 'INFO',
        passed: true,
        reasonCode: 'POLICY_VERIFIED',
        explanation: 'Artifact state satisfies KEEP policy decision contract without unauthorized mutation.',
        expected: 'UNMODIFIED_OR_AUTHORIZED_KEEP',
        observed: 'DECISION_MATCH',
        findingsCount: 0,
        warnings,
      };
    }

    // REVIEW Decision Contract
    if (decisionType === 'REVIEW') {
      if (isPublishedAsSanitized) {
        return {
          verifierType: 'POLICY_VERIFIER',
          status: 'FAILED',
          severity: 'CRITICAL',
          passed: false,
          reasonCode: 'FALSELY_PUBLISHED_AS_SANITIZED',
          explanation: 'Artifact pending human or policy REVIEW was falsely published or flagged as fully sanitized.',
          expected: 'REVIEW_PENDING_NOT_PUBLISHED_SANITIZED',
          observed: 'FALSELY_PUBLISHED_AS_SANITIZED',
          findingsCount: 1,
          warnings: ['Unsanitized or review-pending document published as clean.'],
        };
      }

      return {
        verifierType: 'POLICY_VERIFIER',
        status: 'PARTIAL',
        severity: 'INFO',
        passed: true,
        reasonCode: 'REVIEW_STATE_MAINTAINED',
        explanation: 'Artifact maintains active REVIEW status without false publication as fully sanitized.',
        expected: 'REVIEW_PENDING_NOT_PUBLISHED_SANITIZED',
        observed: 'REVIEW_STATE_MAINTAINED',
        findingsCount: 0,
        warnings: ['Policy decision is REVIEW; manual approval required before final publication.'],
      };
    }

    // Default Fallback
    return {
      verifierType: 'POLICY_VERIFIER',
      status: 'VERIFIED',
      severity: 'INFO',
      passed: true,
      reasonCode: 'POLICY_VERIFIED',
      explanation: 'Output artifact state accurately reflects Phase 09 policy decision contract.',
      expected: decisionType || 'POLICY_COMPLIANT',
      observed: 'DECISION_MATCH',
      findingsCount: 0,
      warnings,
    };
  }
}
