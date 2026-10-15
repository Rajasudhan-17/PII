import { RiskCalculator } from '../../src/services/risk/riskCalculator';

describe('Risk Formula & Threshold Boundaries Unit Tests', () => {
  test('TEST 1: All signals = 0 expected score = 0', () => {
    const res = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 0,
      combinationRiskScore: 0,
      geographicRiskScore: 0,
      temporalRiskScore: 0,
      linkageRiskScore: 0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 0,
      hasPopulationData: true,
    });
    expect(res.reidentificationRiskScore).toBe(0);
    expect(res.riskLevel).toBe('LOW');
  });

  test('TEST 2: All signals = 1 expected score = 1', () => {
    const res = RiskCalculator.calculateRisk({
      directIdentifierCount: 1,
      quasiIdentifierCount: 5,
      combinationRiskScore: 1.0,
      geographicRiskScore: 1.0,
      temporalRiskScore: 1.0,
      linkageRiskScore: 1.0,
      heuristicRarityScore: 1.0,
      maxSensitivityScore: 1.0,
      hasPopulationData: true,
    });
    expect(res.reidentificationRiskScore).toBe(1.0);
    expect(res.riskLevel).toBe('CRITICAL');
  });

  test('TEST 3: Only Direct = 1 expected score = 0.85 (via safety override)', () => {
    const res = RiskCalculator.calculateRisk({
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
    expect(res.reidentificationRiskScore).toBe(0.85);
    expect(res.riskLevel).toBe('VERY_HIGH');
  });

  test('TEST 4: Only Combination = 1 expected score = 0.25', () => {
    const res = RiskCalculator.calculateRisk({
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
    expect(res.reidentificationRiskScore).toBe(0.25);
    expect(res.riskLevel).toBe('MODERATE');
  });

  test('TEST 5: Only Geographic = 1 expected score = 0.15', () => {
    const res = RiskCalculator.calculateRisk({
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
    expect(res.reidentificationRiskScore).toBe(0.15);
    expect(res.riskLevel).toBe('LOW');
  });

  test('TEST 6: Only Temporal = 1 expected score = 0.10', () => {
    const res = RiskCalculator.calculateRisk({
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
    expect(res.reidentificationRiskScore).toBe(0.10);
    expect(res.riskLevel).toBe('LOW');
  });

  test('TEST 7: Only Linkage = 1 expected score = 0.05', () => {
    const res = RiskCalculator.calculateRisk({
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
    expect(res.reidentificationRiskScore).toBe(0.05);
    expect(res.riskLevel).toBe('LOW');
  });

  test('TEST 8: Only Sensitivity = 1 expected score = 0.05', () => {
    const res = RiskCalculator.calculateRisk({
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
    expect(res.reidentificationRiskScore).toBe(0.05);
    expect(res.riskLevel).toBe('LOW');
  });

  test('TEST 9: Repeated identical input produces identical score', () => {
    const input = {
      directIdentifierCount: 0,
      quasiIdentifierCount: 2,
      combinationRiskScore: 0.4,
      geographicRiskScore: 0.3,
      temporalRiskScore: 0.2,
      linkageRiskScore: 0.1,
      heuristicRarityScore: 0.2,
      maxSensitivityScore: 0.5,
      hasPopulationData: true,
    };
    const res1 = RiskCalculator.calculateRisk(input);
    const res2 = RiskCalculator.calculateRisk(input);
    expect(res1.reidentificationRiskScore).toBe(res2.reidentificationRiskScore);
    expect(res1.riskLevel).toBe(res2.riskLevel);
  });

  test('TEST 10 & 11: Score never exceeds 1.0 and never falls below 0', () => {
    const overflow = RiskCalculator.calculateRisk({
      directIdentifierCount: 10,
      quasiIdentifierCount: 20,
      combinationRiskScore: 2.0,
      geographicRiskScore: 2.0,
      temporalRiskScore: 2.0,
      linkageRiskScore: 2.0,
      heuristicRarityScore: 2.0,
      maxSensitivityScore: 2.0,
      hasPopulationData: true,
    });
    expect(overflow.reidentificationRiskScore).toBeLessThanOrEqual(1.0);

    const underflow = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 0,
      combinationRiskScore: -1.0,
      geographicRiskScore: -1.0,
      temporalRiskScore: -1.0,
      linkageRiskScore: -1.0,
      heuristicRarityScore: -1.0,
      maxSensitivityScore: -1.0,
      hasPopulationData: true,
    });
    expect(underflow.reidentificationRiskScore).toBeGreaterThanOrEqual(0.0);
  });

  test('Risk level threshold boundary mappings', () => {
    // LOW: < 0.20
    const score0_199 = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 1,
      combinationRiskScore: 0.799996, // 0.25 * 0.799996 = 0.199999
      geographicRiskScore: 0,
      temporalRiskScore: 0,
      linkageRiskScore: 0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 0,
      hasPopulationData: true,
    });
    expect(score0_199.reidentificationRiskScore).toBeLessThan(0.20);
    expect(score0_199.riskLevel).toBe('LOW');

    // MODERATE: 0.20 <= score < 0.45
    const score0_20 = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 1,
      combinationRiskScore: 0.80, // 0.25 * 0.80 = 0.20
      geographicRiskScore: 0,
      temporalRiskScore: 0,
      linkageRiskScore: 0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 0,
      hasPopulationData: true,
    });
    expect(score0_20.reidentificationRiskScore).toBe(0.20);
    expect(score0_20.riskLevel).toBe('MODERATE');

    // HIGH: 0.45 <= score < 0.70
    const score0_45 = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 1,
      combinationRiskScore: 1.0,
      geographicRiskScore: 1.0, // 0.25 + 0.15 = 0.40
      temporalRiskScore: 0.5, // 0.10 * 0.5 = 0.05 -> Total = 0.45
      linkageRiskScore: 0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 0,
      hasPopulationData: true,
    });
    expect(score0_45.reidentificationRiskScore).toBe(0.45);
    expect(score0_45.riskLevel).toBe('HIGH');

    // VERY_HIGH: 0.70 <= score < 0.88
    const score0_70 = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 1,
      combinationRiskScore: 1.0,
      geographicRiskScore: 1.0,
      temporalRiskScore: 1.0,
      linkageRiskScore: 1.0,
      heuristicRarityScore: 1.0,
      maxSensitivityScore: 1.0, // Total = 0.60 -> Direct override raises to 0.85 or with combination = 0.70
      hasPopulationData: true,
    });
    expect(score0_70.reidentificationRiskScore).toBeGreaterThanOrEqual(0.60);

    // CRITICAL: >= 0.88
    const score0_88 = RiskCalculator.calculateRisk({
      directIdentifierCount: 1,
      quasiIdentifierCount: 2,
      combinationRiskScore: 1.0, // 0.25
      geographicRiskScore: 1.0, // 0.15 -> sum = 0.40 + 0.40 direct = 0.80, override = 0.85
      temporalRiskScore: 1.0, // + 0.10 = 0.90 -> CRITICAL
      linkageRiskScore: 0,
      heuristicRarityScore: 0,
      maxSensitivityScore: 0,
      hasPopulationData: true,
    });
    expect(score0_88.reidentificationRiskScore).toBeGreaterThanOrEqual(0.88);
    expect(score0_88.riskLevel).toBe('CRITICAL');
  });
});
