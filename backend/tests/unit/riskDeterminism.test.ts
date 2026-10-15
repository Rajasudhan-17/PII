import { RiskCalculator } from '../../src/services/risk/riskCalculator';
import { CombinationAnalyzer } from '../../src/services/risk/combinationAnalyzer';

describe('Risk Engine Deterministic Repeatability Unit Tests', () => {
  test('Identical input attributes produce 100% identical risk score, level, confidence, and combination set', () => {
    const attributes = ['POSTAL_CODE', 'DATE_OF_BIRTH', 'GENDER', 'JOB_TITLE'];

    const combEval1 = CombinationAnalyzer.analyzeCombinations(attributes);
    const combEval2 = CombinationAnalyzer.analyzeCombinations(attributes);

    expect(combEval1.combinationRiskScore).toBe(combEval2.combinationRiskScore);
    expect(combEval1.evaluatedCombinationCount).toBe(combEval2.evaluatedCombinationCount);
    expect(combEval1.topCombinationAttributes).toEqual(combEval2.topCombinationAttributes);

    const risk1 = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: attributes.length,
      combinationRiskScore: combEval1.combinationRiskScore,
      geographicRiskScore: combEval1.geographicRiskScore,
      temporalRiskScore: combEval1.temporalRiskScore,
      linkageRiskScore: combEval1.linkageRiskScore,
      heuristicRarityScore: combEval1.uniquenessRiskScore,
      maxSensitivityScore: 0.6,
      hasPopulationData: false,
    });

    const risk2 = RiskCalculator.calculateRisk({
      directIdentifierCount: 0,
      quasiIdentifierCount: attributes.length,
      combinationRiskScore: combEval2.combinationRiskScore,
      geographicRiskScore: combEval2.geographicRiskScore,
      temporalRiskScore: combEval2.temporalRiskScore,
      linkageRiskScore: combEval2.linkageRiskScore,
      heuristicRarityScore: combEval2.uniquenessRiskScore,
      maxSensitivityScore: 0.6,
      hasPopulationData: false,
    });

    expect(risk1.reidentificationRiskScore).toBe(risk2.reidentificationRiskScore);
    expect(risk1.riskLevel).toBe(risk2.riskLevel);
    expect(risk1.riskConfidence).toBe(risk2.riskConfidence);
    expect(risk1.explanation).toBe(risk2.explanation);
  });
});
