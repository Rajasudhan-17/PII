import { ReidentificationRiskLevel } from '../../models/reidentificationRiskRun.model';

export interface FinalRiskEvaluation {
  reidentificationRiskScore: number;
  riskLevel: ReidentificationRiskLevel;
  riskConfidence: number;
  directIdentifierRiskScore: number;
  quasiIdentifierRiskScore: number;
  uniquenessRiskScore: number;
  combinationRiskScore: number;
  geographicRiskScore: number;
  temporalRiskScore: number;
  linkageRiskScore: number;
  rarityRiskScore: number;
  attributeSensitivityRiskScore: number;
  explanation: string;
}

export class RiskCalculator {
  /**
   * Deterministic normalized weighted risk score calculation formula:
   * Score = 0.40*Direct + 0.25*Combination + 0.15*Geographic + 0.10*Temporal + 0.05*Linkage + 0.05*Sensitivity
   * Total Weights Sum = 0.40 + 0.25 + 0.15 + 0.10 + 0.05 + 0.05 = 1.00 (Mathematically Normalized)
   */
  public static calculateRisk(input: {
    directIdentifierCount: number;
    quasiIdentifierCount: number;
    combinationRiskScore: number;
    geographicRiskScore: number;
    temporalRiskScore: number;
    linkageRiskScore: number;
    heuristicRarityScore: number;
    maxSensitivityScore: number;
    hasPopulationData: boolean;
    isPartialProvenance?: boolean;
    isHeuristicAttributeOnly?: boolean;
    isPartialContext?: boolean;
  }): FinalRiskEvaluation {
    const directIdentifierRiskScore = input.directIdentifierCount > 0 ? 1.0 : 0.0;
    const quasiIdentifierRiskScore = Math.min(1.0, Number((input.quasiIdentifierCount * 0.20).toFixed(4)));
    const combinationRiskScore = input.combinationRiskScore;
    const geographicRiskScore = input.geographicRiskScore;
    const temporalRiskScore = input.temporalRiskScore;
    const linkageRiskScore = input.linkageRiskScore;
    const rarityRiskScore = input.heuristicRarityScore;
    const attributeSensitivityRiskScore = input.maxSensitivityScore;

    // Normalized Weighted Formula (Weights sum to exactly 1.00)
    let rawScore =
      0.40 * directIdentifierRiskScore +
      0.25 * combinationRiskScore +
      0.15 * geographicRiskScore +
      0.10 * temporalRiskScore +
      0.05 * linkageRiskScore +
      0.05 * attributeSensitivityRiskScore;

    // Safety Invariant: Residual direct identifier forces risk score to at least 0.85
    if (input.directIdentifierCount > 0) {
      rawScore = Math.max(rawScore, 0.85);
    }

    const reidentificationRiskScore = Number(Math.min(1.0, Math.max(0.0, rawScore)).toFixed(6));

    // Risk Level Threshold Assignment
    let riskLevel: ReidentificationRiskLevel = 'LOW';
    if (reidentificationRiskScore >= 0.88) {
      riskLevel = 'CRITICAL';
    } else if (reidentificationRiskScore >= 0.70) {
      riskLevel = 'VERY_HIGH';
    } else if (reidentificationRiskScore >= 0.45) {
      riskLevel = 'HIGH';
    } else if (reidentificationRiskScore >= 0.20) {
      riskLevel = 'MODERATE';
    } else {
      riskLevel = 'LOW';
    }

    // Evidence Quality Confidence Model (Distinct from Risk Score Severity)
    let confidenceBase = 1.0;

    if (!input.hasPopulationData) {
      confidenceBase -= 0.15; // Reference population unavailable / heuristic mode
    }
    if (input.isPartialProvenance) {
      confidenceBase -= 0.10; // Partial provenance source evidence
    }
    if (input.isHeuristicAttributeOnly) {
      confidenceBase -= 0.10; // Heuristic attributes without structured metadata
    }
    if (input.isPartialContext) {
      confidenceBase -= 0.05; // Partial context window
    }
    if (input.quasiIdentifierCount === 0 && input.directIdentifierCount === 0) {
      confidenceBase = 1.0; // Clean baseline document without identified risks
    }

    const riskConfidence = Number(Math.min(1.0, Math.max(0.0, confidenceBase)).toFixed(4));

    const explanation = `Evaluated re-identification risk score ${reidentificationRiskScore} [Level: ${riskLevel}] with confidence ${riskConfidence}. Direct Identifiers: ${input.directIdentifierCount}, Combination Score: ${combinationRiskScore}, Geo: ${geographicRiskScore}, Temp: ${temporalRiskScore}, Linkage: ${linkageRiskScore}.`;

    return {
      reidentificationRiskScore,
      riskLevel,
      riskConfidence,
      directIdentifierRiskScore,
      quasiIdentifierRiskScore,
      uniquenessRiskScore: combinationRiskScore,
      combinationRiskScore,
      geographicRiskScore,
      temporalRiskScore,
      linkageRiskScore,
      rarityRiskScore,
      attributeSensitivityRiskScore,
      explanation,
    };
  }
}
