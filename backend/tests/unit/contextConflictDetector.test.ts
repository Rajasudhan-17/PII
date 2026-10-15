import { ContextConflictDetector } from '../../src/services/context/contextConflictDetector';
import { FieldLabelAnalysisResult } from '../../src/services/context/fieldLabelAnalyzer';

describe('ContextConflictDetector Unit Tests', () => {
  test('should detect conflict when phone number candidate is near invoice number label', () => {
    const mockFieldAnalysis: FieldLabelAnalysisResult = {
      fieldLabel: 'Invoice Number',
      detectedRole: 'FINANCIAL_FIELD',
      positiveSignals: [
        {
          signalType: 'FIELD_LABEL_MATCH',
          weight: 0.35,
          provenance: 'Label Invoice Number',
          description: 'Match',
        },
      ],
      negativeSignals: [],
      nearbyKeywords: ['invoice'],
    };

    const res = ContextConflictDetector.detectConflicts('PHONE_NUMBER', mockFieldAnalysis, 'Invoice Number: 9876543210');
    expect(res.ambiguityIndicators).toContain('CONFLICTING_CONTEXT');
    expect(res.conflictSignals.some((s) => s.signalType === 'NEGATIVE_CONTEXT_SIGNAL')).toBe(true);
  });

  test('should flag WEAK_CONTEXT when no field label is found', () => {
    const mockFieldAnalysis: FieldLabelAnalysisResult = {
      fieldLabel: null,
      detectedRole: 'UNKNOWN',
      positiveSignals: [],
      negativeSignals: [],
      nearbyKeywords: [],
    };

    const res = ContextConflictDetector.detectConflicts('EMAIL_ADDRESS', mockFieldAnalysis, 'john@example.com');
    expect(res.ambiguityIndicators).toContain('WEAK_CONTEXT');
  });
});
