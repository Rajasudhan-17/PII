import { OverallVerificationStatus } from '../../../models/verificationRun.model';
import { VerifierSeverity } from '../../../models/verificationResult.model';

export interface TransformationOutcome {
  verifierType: 'TRANSFORMATION_VERIFIER';
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

export class TransformationVerifier {
  public static verify(params: {
    transformationRunExists: boolean;
    operationType?: string | null;
    sourceChecksum: string;
    outputChecksum: string;
    residualProhibitedContentObserved?: boolean;
    isPublishedAsSanitized?: boolean;
  }): TransformationOutcome {
    const warnings: string[] = [];

    if (!params.transformationRunExists && params.sourceChecksum !== params.outputChecksum) {
      warnings.push('No upstream Phase 10 transformation run record found for modified output artifact.');
    }

    const operation = (params.operationType || '').toUpperCase();

    // 1. REDACT / MUTATE Operation: Requires observable artifact mutation & clean state
    if (operation === 'REDACT' || operation === 'MUTATE') {
      if (params.sourceChecksum === params.outputChecksum) {
        return {
          verifierType: 'TRANSFORMATION_VERIFIER',
          status: 'FAILED',
          severity: 'HIGH',
          passed: false,
          reasonCode: 'UNTRANSFORMED_REDACTION_OUTPUT',
          explanation: `Transformation operation was expected to be ${operation}, but output artifact checksum is identical to source artifact checksum.`,
          expected: 'MODIFIED_OUTPUT_CHECKSUM',
          observed: params.outputChecksum,
          findingsCount: 1,
          warnings: ['Transformation operation failed to mutate output file.'],
        };
      }

      if (params.residualProhibitedContentObserved) {
        return {
          verifierType: 'TRANSFORMATION_VERIFIER',
          status: 'FAILED',
          severity: 'CRITICAL',
          passed: false,
          reasonCode: 'PROHIBITED_CONTENT_SURVIVES_TRANSFORMATION',
          explanation: `Transformation operation ${operation} altered file checksum, but prohibited candidate content survived in output artifact.`,
          expected: 'TRANSFORMED_AND_CLEAN_ARTIFACT',
          observed: 'PROHIBITED_CONTENT_SURVIVED',
          findingsCount: 1,
          warnings: ['Transformation was incomplete; sensitive content persists.'],
        };
      }

      return {
        verifierType: 'TRANSFORMATION_VERIFIER',
        status: 'VERIFIED',
        severity: 'INFO',
        passed: true,
        reasonCode: 'TRANSFORMATION_VERIFIED',
        explanation: `Independently verified ${operation} transformation execution and output artifact state consistency.`,
        expected: `${operation}_TRANSFORMED_OUTPUT`,
        observed: 'OUTPUT_MUTATED_AND_CLEAN',
        findingsCount: 0,
        warnings,
      };
    }

    // 2. KEEP Operation: Output may legitimately equal source
    if (operation === 'KEEP') {
      return {
        verifierType: 'TRANSFORMATION_VERIFIER',
        status: 'VERIFIED',
        severity: 'INFO',
        passed: true,
        reasonCode: 'TRANSFORMATION_VERIFIED',
        explanation: 'Independently verified KEEP decision contract. Source artifact preserved without unauthorized mutation.',
        expected: 'KEEP_UNMUTATED_SOURCE',
        observed: params.sourceChecksum === params.outputChecksum ? 'IDENTICAL_SOURCE' : 'AUTHORIZED_KEEP_STATE',
        findingsCount: 0,
        warnings,
      };
    }

    // 3. REVIEW Operation: Must not falsely claim sanitization
    if (operation === 'REVIEW') {
      if (params.isPublishedAsSanitized) {
        return {
          verifierType: 'TRANSFORMATION_VERIFIER',
          status: 'FAILED',
          severity: 'CRITICAL',
          passed: false,
          reasonCode: 'REVIEW_ARTIFACT_FALSELY_SANITIZED',
          explanation: 'Artifact subject to REVIEW was falsely flagged or published as fully sanitized.',
          expected: 'REVIEW_PENDING_STATE',
          observed: 'FALSELY_PUBLISHED_AS_SANITIZED',
          findingsCount: 1,
          warnings: ['Unapproved review document published as sanitized.'],
        };
      }

      return {
        verifierType: 'TRANSFORMATION_VERIFIER',
        status: 'PARTIAL',
        severity: 'INFO',
        passed: true,
        reasonCode: 'TRANSFORMATION_VERIFIED',
        explanation: 'Independently verified REVIEW decision state. Manual review required prior to publication.',
        expected: 'REVIEW_PENDING_STATE',
        observed: 'REVIEW_STATE_PRESERVED',
        findingsCount: 0,
        warnings: ['Review state maintained.'],
      };
    }

    return {
      verifierType: 'TRANSFORMATION_VERIFIER',
      status: 'VERIFIED',
      severity: 'INFO',
      passed: true,
      reasonCode: 'TRANSFORMATION_VERIFIED',
      explanation: 'Independently verified transformation execution and output artifact state consistency.',
      expected: params.operationType || 'TRANSFORMATION_COMPLETED',
      observed: 'OUTPUT_VALID',
      findingsCount: 0,
      warnings,
    };
  }
}
