import { OverallVerificationStatus } from '../../../models/verificationRun.model';
import { VerifierSeverity } from '../../../models/verificationResult.model';

export interface RiskConsistencyOutcome {
  verifierType: 'RISK_CONSISTENCY_VERIFIER';
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

export class RiskConsistencyVerifier {
  public static verify(
    storedRiskLevel: string | null,
    hasResidualDirectIdentifier: boolean
  ): RiskConsistencyOutcome {
    const warnings: string[] = [];

    if (storedRiskLevel === 'LOW' && hasResidualDirectIdentifier) {
      return {
        verifierType: 'RISK_CONSISTENCY_VERIFIER',
        status: 'FAILED',
        severity: 'HIGH',
        passed: false,
        reasonCode: 'RISK_LEVEL_INCONSISTENCY',
        explanation: 'Phase 12 reported LOW risk level, but independent verification observed a residual direct identifier.',
        expected: 'CRITICAL_OR_HIGH_RISK_LEVEL',
        observed: storedRiskLevel,
        findingsCount: 1,
        warnings: ['Stored risk level is inconsistent with observed residual direct identifier.'],
      };
    }

    return {
      verifierType: 'RISK_CONSISTENCY_VERIFIER',
      status: 'VERIFIED',
      severity: 'INFO',
      passed: true,
      reasonCode: 'RISK_CONSISTENCY_VERIFIED',
      explanation: 'Phase 12 risk metrics are consistent with independent verification findings.',
      expected: storedRiskLevel || 'CONSISTENT_RISK',
      observed: 'RISK_RECONCILED',
      findingsCount: 0,
      warnings,
    };
  }
}
