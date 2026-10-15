import { RiskCalculator } from '../../src/services/risk/riskCalculator';

describe('Risk Confidence Model Unit Tests', () => {
  test('Risk confidence remains bounded within 0.0 and 1.0', () => {
    const maxConf = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 2,
      combinationRiskScore: 0.5,
      geographicRiskScore: 0.5,
      temporalRiskScore: 0.5,
      linkageRiskScore: 0.5,
      heuristicRarityScore: 0.5,
      maxSensitivityScore: 0.5,
      hasPopulationData: true,
    });
    expect(maxConf.riskConfidence).toBe(1.0);
    expect(maxConf.riskConfidence).toBeLessThanOrEqual(1.0);
    expect(maxConf.riskConfidence).toBeGreaterThanOrEqual(0.0);
  });

  test('Heuristic population mode applies -0.15 evidence quality penalty', () => {
    const heuristicConf = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 2,
      combinationRiskScore: 0.5,
      geographicRiskScore: 0.5,
      temporalRiskScore: 0.5,
      linkageRiskScore: 0.5,
      heuristicRarityScore: 0.5,
      maxSensitivityScore: 0.5,
      hasPopulationData: false,
    });
    expect(heuristicConf.riskConfidence).toBe(0.85);
  });

  test('Partial provenance and heuristic attributes apply cumulative penalties', () => {
    const partialConf = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 2,
      combinationRiskScore: 0.5,
      geographicRiskScore: 0.5,
      temporalRiskScore: 0.5,
      linkageRiskScore: 0.5,
      heuristicRarityScore: 0.5,
      maxSensitivityScore: 0.5,
      hasPopulationData: false, // -0.15
      isPartialProvenance: true, // -0.10
      isHeuristicAttributeOnly: true, // -0.10
      isPartialContext: true, // -0.05
    });
    // Base 1.0 - 0.15 - 0.10 - 0.10 - 0.05 = 0.60
    expect(partialConf.riskConfidence).toBe(0.60);
  });

  test('Clean document with zero identifiers maintains baseline confidence of 1.0', () => {
    const cleanDoc = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 0,
      combinationRiskScore: 0,
      geographicRiskScore: 0,
      temporalRiskScore: 0,
      linkageRiskScore: 0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 0,
      hasPopulationData: false,
    });
    expect(cleanDoc.riskConfidence).toBe(1.0);
  });
});
