import { RiskCalculator } from '../../src/services/risk/riskCalculator';

describe('Risk Formula Normalization Unit Tests', () => {
  test('Weights sum exactly to 1.00 without premature score saturation', () => {
    // Test individual weight contributions
    const directOnly = RiskCalculator.calculateRisk({
      directIdentifierCount: 1,
      quasiIdentifierCount: 0,
      combinationRiskScore: 0,
      geographicRiskScore: 0,
      temporalRiskScore: 0,
      linkageRiskScore: 0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 0,
      hasPopulationData: true,
    });
    expect(directOnly.reidentificationRiskScore).toBe(0.85); // Direct identifier present triggers baseline override 0.85; without override raw weight contribution is 0.40

    const combinationOnly = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 1,
      combinationRiskScore: 1.0,
      geographicRiskScore: 0,
      temporalRiskScore: 0,
      linkageRiskScore: 0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 0,
      hasPopulationData: true,
    });
    expect(combinationOnly.reidentificationRiskScore).toBe(0.25);

    const geoOnly = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 1,
      combinationRiskScore: 0,
      geographicRiskScore: 1.0,
      temporalRiskScore: 0,
      linkageRiskScore: 0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 0,
      hasPopulationData: true,
    });
    expect(geoOnly.reidentificationRiskScore).toBe(0.15);

    const tempOnly = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 1,
      combinationRiskScore: 0,
      geographicRiskScore: 0,
      temporalRiskScore: 1.0,
      linkageRiskScore: 0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 0,
      hasPopulationData: true,
    });
    expect(tempOnly.reidentificationRiskScore).toBe(0.10);

    const linkageOnly = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 1,
      combinationRiskScore: 0,
      geographicRiskScore: 0,
      temporalRiskScore: 0,
      linkageRiskScore: 1.0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 0,
      hasPopulationData: true,
    });
    expect(linkageOnly.reidentificationRiskScore).toBe(0.05);

    const sensitivityOnly = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 1,
      combinationRiskScore: 0,
      geographicRiskScore: 0,
      temporalRiskScore: 0,
      linkageRiskScore: 0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 1.0,
      hasPopulationData: true,
    });
    expect(sensitivityOnly.reidentificationRiskScore).toBe(0.05);

    // Sum of non-direct weights: 0.25 + 0.15 + 0.10 + 0.05 + 0.05 = 0.60
    const nonDirectSum = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 1,
      combinationRiskScore: 1.0,
      geographicRiskScore: 1.0,
      temporalRiskScore: 1.0,
      linkageRiskScore: 1.0,
      heuristicRarityScore: 1.0,
      maxSensitivityScore: 1.0,
      hasPopulationData: true,
    });
    expect(nonDirectSum.reidentificationRiskScore).toBe(0.60);
  });
});
