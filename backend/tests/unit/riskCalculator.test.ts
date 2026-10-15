import { RiskCalculator } from '../../src/services/risk/riskCalculator';
import { CombinationAnalyzer } from '../../src/services/risk/combinationAnalyzer';
import { ReferencePopulationProvider } from '../../src/services/risk/populationProvider';
import { classifyAttribute } from '../../src/services/risk/quasiIdentifier.taxonomy';

describe('RiskCalculator Unit Tests', () => {
  test('classifyAttribute correctly categorizes quasi-identifiers', () => {
    expect(classifyAttribute('POSTAL_CODE').category).toBe('GEOGRAPHIC');
    expect(classifyAttribute('DATE_OF_BIRTH').category).toBe('DEMOGRAPHIC');
    expect(classifyAttribute('JOB_TITLE').category).toBe('PROFESSIONAL');
    expect(classifyAttribute('CASE_NUMBER').category).toBe('DOCUMENT_SPECIFIC');
  });

  test('calculateRisk produces LOW risk level when no identifiers or high risk factors are present', () => {
    const res = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: 1,
      combinationRiskScore: 0.1,
      geographicRiskScore: 0.0,
      temporalRiskScore: 0.0,
      linkageRiskScore: 0.1,
      heuristicRarityScore: 0.05,
      maxSensitivityScore: 0.2,
      hasPopulationData: false,
    });

    expect(res.riskLevel).toBe('LOW');
    expect(res.reidentificationRiskScore).toBeLessThan(0.20);
    expect(res.riskConfidence).toBe(0.85);
  });

  test('calculateRisk produces VERY_HIGH risk level when residual direct identifiers raise baseline risk to 0.85', () => {
    const res = RiskCalculator.calculateRisk({
      directIdentifierCount: 1,
      quasiIdentifierCount: 2,
      combinationRiskScore: 0.3,
      geographicRiskScore: 0.2,
      temporalRiskScore: 0.1,
      linkageRiskScore: 0.2,
      heuristicRarityScore: 0.3,
      maxSensitivityScore: 0.9,
      hasPopulationData: false,
    });

    expect(res.riskLevel).toBe('VERY_HIGH');
    expect(res.directIdentifierRiskScore).toBe(1.0);
    expect(res.reidentificationRiskScore).toBe(0.85);
  });

  test('calculateRisk produces CRITICAL risk level when score reaches >= 0.88', () => {
    const res = RiskCalculator.calculateRisk({
      directIdentifierCount: 1,
      quasiIdentifierCount: 5,
      combinationRiskScore: 0.8,
      geographicRiskScore: 0.8,
      temporalRiskScore: 0.8,
      linkageRiskScore: 0.8,
      heuristicRarityScore: 0.8,
      maxSensitivityScore: 0.9,
      hasPopulationData: true,
    });

    expect(res.riskLevel).toBe('CRITICAL');
    expect(res.reidentificationRiskScore).toBeGreaterThanOrEqual(0.88);
  });

  test('calculateRisk bounds maximum risk score to 1.0', () => {
    const res = RiskCalculator.calculateRisk({
      directIdentifierCount: 5,
      quasiIdentifierCount: 10,
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
    expect(res.riskConfidence).toBe(1.0);
  });

  test('CombinationAnalyzer bounds evaluation to max 4-way combinations and 30 attributes', () => {
    const manyAttributes = Array.from({ length: 40 }, (_, i) => `ATTR_${i}`);
    const evalRes = CombinationAnalyzer.analyzeCombinations(manyAttributes);

    expect(evalRes.evaluatedCombinationCount).toBeGreaterThan(0);
    expect(evalRes.topCombinationAttributes.length).toBeLessThanOrEqual(4);
  });

  test('ReferencePopulationProvider defaults to HEURISTIC mode with no fabricated statistics', () => {
    const popEval = ReferencePopulationProvider.evaluatePopulationRisk(['ZIP_CODE', 'DATE_OF_BIRTH'], 0.4);

    expect(popEval.mode).toBe('HEURISTIC');
    expect(popEval.kAnonymityEstimate).toBeNull();
    expect(popEval.lDiversitySignal).toBe('HEURISTIC_DIVERSITY_SIGNAL');
    expect(popEval.heuristicRarityScore).toBeDefined();
  });
});
