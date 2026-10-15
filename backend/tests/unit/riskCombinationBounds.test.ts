import { CombinationAnalyzer } from '../../src/services/risk/combinationAnalyzer';

describe('Risk Engine Combination & Resource Bounds Unit Tests', () => {
  test('CombinationAnalyzer caps attribute set size to max 30 and depth to max 4', () => {
    const hugeAttributeSet = Array.from({ length: 60 }, (_, i) => `QUASI_ATTR_${i}`);

    const startTime = Date.now();
    const evalRes = CombinationAnalyzer.analyzeCombinations(hugeAttributeSet);
    const durationMs = Date.now() - startTime;

    expect(evalRes.evaluatedCombinationCount).toBeGreaterThan(0);
    expect(evalRes.evaluatedCombinationCount).toBeLessThan(100000); // Bounded analysis combinations
    expect(evalRes.topCombinationAttributes.length).toBeLessThanOrEqual(4);
    expect(durationMs).toBeLessThan(1000); // Fast bounded computation
  });
});
