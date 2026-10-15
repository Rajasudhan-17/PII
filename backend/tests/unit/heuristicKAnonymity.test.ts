import { ReferencePopulationProvider } from '../../src/services/risk/populationProvider';

describe('Heuristic k-Anonymity & Population Semantics Unit Tests', () => {
  test('TEST A: No reference population forces kAnonymityEstimate to null', () => {
    const res = ReferencePopulationProvider.evaluatePopulationRisk(['ZIP_CODE', 'DATE_OF_BIRTH'], 0.5);

    expect(res.mode).toBe('HEURISTIC');
    expect(res.kAnonymityEstimate).toBeNull();
  });

  test('TEST B: High heuristic rarity score STILL yields kAnonymityEstimate = null', () => {
    const res = ReferencePopulationProvider.evaluatePopulationRisk(['GPS_COORDINATE', 'US_SSN', 'DIAGNOSIS_CODE'], 0.95);

    expect(res.mode).toBe('HEURISTIC');
    expect(res.kAnonymityEstimate).toBeNull();
    expect(res.heuristicRarityScore).toBeGreaterThan(0.5);
  });

  test('TEST C: Valid reference population mode allows numeric kAnonymityEstimate', () => {
    const popProvider = new ReferencePopulationProvider();
    // Simulate loading reference population data
    popProvider.loadPopulationDataset('US_CENSUS_2020', new Map([['ZIP_CODE_DOB', 42]]));

    const res = popProvider.evaluateRiskWithLoadedDataset(['ZIP_CODE_DOB'], 0.5);

    expect(res.mode).toBe('REFERENCE_DATA_AVAILABLE');
    expect(res.kAnonymityEstimate).toBe(42);
  });

  test('TEST D: Unavailable reference population never fabricates statistical population counts', () => {
    const res = ReferencePopulationProvider.evaluatePopulationRisk(['POSTAL_CODE'], 0.2);

    expect(res.mode).toBe('HEURISTIC');
    expect(res.kAnonymityEstimate).toBeNull();
    expect(res.lDiversitySignal).toBe('HEURISTIC_DIVERSITY_SIGNAL');
  });

  test('TEST E: Different heuristic rarity levels change rarity risk score but keep k = null', () => {
    const lowRarity = ReferencePopulationProvider.evaluatePopulationRisk(['COUNTRY'], 0.05);
    const highRarity = ReferencePopulationProvider.evaluatePopulationRisk(['STREET_ADDRESS', 'TIMESTAMP'], 0.85);

    expect(lowRarity.kAnonymityEstimate).toBeNull();
    expect(highRarity.kAnonymityEstimate).toBeNull();
    expect(highRarity.heuristicRarityScore).toBeGreaterThan(lowRarity.heuristicRarityScore);
  });
});
