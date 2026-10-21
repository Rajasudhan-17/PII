import { EvidenceAggregator, CandidateInput } from '../../src/detection/evidenceAggregator';

describe('Adversarial False-Positive Resilience Tests', () => {
  it('does NOT classify corporate entities and law firm names as person names for redaction', () => {
    const businessText = `
      This Master Services Agreement is entered into by Microsoft Corporation and John Smith LLP,
      in consultation with Smith & Associates. Services provided by Northwind Traders.
    `;

    const rawCandidates: CandidateInput[] = [
      {
        type: 'PERSON_NAME',
        label: 'NAME',
        value: 'Microsoft Corporation',
        startOffset: businessText.indexOf('Microsoft Corporation'),
        endOffset: businessText.indexOf('Microsoft Corporation') + 'Microsoft Corporation'.length,
        detector: 'HeuristicCapitalized',
        confidence: 0.65,
      },
      {
        type: 'PERSON_NAME',
        label: 'NAME',
        value: 'John Smith LLP',
        startOffset: businessText.indexOf('John Smith LLP'),
        endOffset: businessText.indexOf('John Smith LLP') + 'John Smith LLP'.length,
        detector: 'HeuristicCapitalized',
        confidence: 0.65,
      },
      {
        type: 'PERSON_NAME',
        label: 'NAME',
        value: 'Northwind Traders',
        startOffset: businessText.indexOf('Northwind Traders'),
        endOffset: businessText.indexOf('Northwind Traders') + 'Northwind Traders'.length,
        detector: 'HeuristicCapitalized',
        confidence: 0.62,
      },
    ];

    const results = EvidenceAggregator.aggregateAndDecide(businessText, rawCandidates);

    for (const cand of results) {
      // Must NOT be automatically marked for REDACT
      expect(cand.decision).not.toBe('REDACT');
      expect(cand.decision).toBe('KEEP');
      expect(cand.contextScore).toBeLessThan(0); // Negative context score recognized
    }
  });

  it('does NOT classify generic business emails (support@, sales@) as sensitive personal emails for redaction', () => {
    const emailText = `
      For inquiries please contact support@example.com or sales@enterprise-solutions.com.
      Do not send private emails to info@example.com.
    `;

    const rawCandidates: CandidateInput[] = [
      {
        type: 'EMAIL_ADDRESS',
        label: 'EMAIL',
        value: 'support@example.com',
        startOffset: emailText.indexOf('support@example.com'),
        endOffset: emailText.indexOf('support@example.com') + 'support@example.com'.length,
        detector: 'EmailRegex',
        confidence: 0.99,
      },
      {
        type: 'EMAIL_ADDRESS',
        label: 'EMAIL',
        value: 'sales@enterprise-solutions.com',
        startOffset: emailText.indexOf('sales@enterprise-solutions.com'),
        endOffset: emailText.indexOf('sales@enterprise-solutions.com') + 'sales@enterprise-solutions.com'.length,
        detector: 'EmailRegex',
        confidence: 0.99,
      },
    ];

    const results = EvidenceAggregator.aggregateAndDecide(emailText, rawCandidates);

    for (const cand of results) {
      expect(cand.decision).toBe('KEEP');
    }
  });

  it('does NOT classify standard invoice, case, or product codes as phone numbers or government IDs', () => {
    const documentText = `
      Invoice Number: 20261047
      Case Number: 2026/1047
      Product Code: ABC12345
      Employee ID: 123456
      The parties agree that all statutory requirements are satisfied.
    `;

    const rawCandidates: CandidateInput[] = [
      {
        type: 'PHONE_NUMBER',
        label: 'PHONE',
        value: '20261047',
        startOffset: documentText.indexOf('20261047'),
        endOffset: documentText.indexOf('20261047') + '20261047'.length,
        detector: 'NaiveDigits',
        confidence: 0.5,
      },
    ];

    const results = EvidenceAggregator.aggregateAndDecide(documentText, rawCandidates);

    // Bare numbers without phone markers must NOT be automatically REDACT
    for (const cand of results) {
      expect(cand.decision).not.toBe('REDACT');
    }
  });
});
