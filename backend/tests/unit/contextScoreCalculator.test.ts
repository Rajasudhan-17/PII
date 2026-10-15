import { ContextScoreCalculator } from '../../src/services/context/contextScoreCalculator';
import { IContextSignal, IRelationshipEvidence } from '../../src/models/contextResult.model';

describe('ContextScoreCalculator Unit Tests', () => {
  test('should calculate contextualScore bounded between 0.0 and 1.0', () => {
    const positiveSignals: IContextSignal[] = [
      { signalType: 'FIELD_LABEL_MATCH', weight: 0.35, provenance: 'test', description: 'desc' },
    ];
    const structuralSignals: IContextSignal[] = [
      { signalType: 'TABLE_ROW_MATCH', weight: 0.3, provenance: 'test', description: 'desc' },
    ];
    const relationships: IRelationshipEvidence[] = [
      {
        relatedCandidateId: 'c2',
        relatedType: 'EMAIL_ADDRESS',
        relationshipType: 'PERSON_NAME_EMAIL',
        status: 'SUPPORTED',
        evidenceDetails: 'details',
      },
    ];

    const score = ContextScoreCalculator.calculateScore(
      positiveSignals,
      [],
      structuralSignals,
      [],
      relationships,
      []
    );

    expect(score).toBeGreaterThanOrEqual(0.0);
    expect(score).toBeLessThanOrEqual(1.0);
    expect(score).toBe(1.0); // 0.5 base + 0.35 + 0.3 + 0.1 = 1.25 -> clamped to 1.0
  });

  test('should apply negative penalties for conflicting context', () => {
    const score = ContextScoreCalculator.calculateScore(
      [],
      [{ signalType: 'NEGATIVE_CONTEXT_SIGNAL', weight: 0.4, provenance: 'p', description: 'd' }],
      [],
      [],
      [],
      ['CONFLICTING_CONTEXT']
    );

    expect(score).toBeLessThan(0.5);
  });
});
