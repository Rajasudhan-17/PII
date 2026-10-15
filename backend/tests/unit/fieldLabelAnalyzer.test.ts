import { FieldLabelAnalyzer } from '../../src/services/context/fieldLabelAnalyzer';

describe('FieldLabelAnalyzer Unit Tests', () => {
  test('should detect positive field label match in context window', () => {
    const windowText = 'Customer Name: John Smith';
    const res = FieldLabelAnalyzer.analyze(windowText, 'PERSON_NAME');

    expect(res.fieldLabel).toBeDefined();
    expect(res.detectedRole).toBe('PERSON_NAME');
    expect(res.positiveSignals.length).toBeGreaterThan(0);
    expect(res.negativeSignals.length).toBe(0);
  });

  test('should detect negative field label match in context window', () => {
    const windowText = 'Example email: test@example.com';
    const res = FieldLabelAnalyzer.analyze(windowText, 'EMAIL_ADDRESS');

    expect(res.negativeSignals.length).toBeGreaterThan(0);
    expect(res.negativeSignals[0].signalType).toBe('NEGATIVE_CONTEXT_SIGNAL');
  });

  test('should detect table header field label match', () => {
    const windowText = 'john@example.com';
    const columnHeader = 'Email Address';
    const res = FieldLabelAnalyzer.analyze(windowText, 'EMAIL_ADDRESS', columnHeader);

    expect(res.fieldLabel).toBe('Email Address');
    expect(res.detectedRole).toBe('CONTACT_FIELD');
    expect(res.positiveSignals.some((s) => s.signalType === 'TABLE_HEADER_MATCH')).toBe(true);
  });
});
