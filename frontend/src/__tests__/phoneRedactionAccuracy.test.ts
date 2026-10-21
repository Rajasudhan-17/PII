import { describe, it, expect } from 'vitest';
import { detectPII, applyRedactionsToText } from '../services/realScanner';
import { RuleSet } from '../context/RedactContext';

const standardRuleSet: RuleSet = {
  id: 'standard',
  name: 'Standard',
  isCustom: false,
  typeSummary: 'Standard Test RuleSet',
  detectors: {
    emails: true,
    phones: true,
    cards: true,
    names: true,
  },
  alwaysRedact: [],
  neverRedact: [],
  confidenceThreshold: 70,
  defaultLook: 'bar',
};

describe('Phone Number Detection and Proper Redaction', () => {
  const phoneTestCases = [
    { text: 'Contact Priya at +91 98765 43210 for account verification.', expectedPhone: '+91 98765 43210' },
    { text: 'Call our helpdesk at +91-98765-43210 immediately.', expectedPhone: '+91-98765-43210' },
    { text: 'Mobile: 9876543210 is registered to user.', expectedPhone: '9876543210' },
    { text: 'Reach me at +1 (555) 123-4567 during work hours.', expectedPhone: '+1 (555) 123-4567' },
    { text: 'Direct line is (555) 123-4567.', expectedPhone: '(555) 123-4567' },
    { text: 'Support phone: 555-123-4567.', expectedPhone: '555-123-4567' },
    { text: 'London branch office: +44 20 7946 0919.', expectedPhone: '+44 20 7946 0919' },
    { text: 'Office direct line: (020) 7946 0919.', expectedPhone: '(020) 7946 0919' },
    { text: 'Bangalore landline: 080-23456789.', expectedPhone: '080-23456789' },
    { text: 'Toll-free hotline: +1-800-555-0199.', expectedPhone: '+1-800-555-0199' },
    { text: 'Emergency cell: +919876543210.', expectedPhone: '+919876543210' },
  ];

  for (const tc of phoneTestCases) {
    it(`should detect and automatically mark as REDACT: "${tc.expectedPhone}"`, () => {
      const findings = detectPII(tc.text, standardRuleSet);
      const phoneFinding = findings.find((f) => f.type === 'PHONE_NUMBER');

      expect(phoneFinding).toBeDefined();
      expect(phoneFinding!.status).toBe('redact');
      expect(phoneFinding!.confidence).toBeGreaterThanOrEqual(85);

      // Verify that applyRedactionsToText completely replaces the phone number
      const redactedBar = applyRedactionsToText(tc.text, findings, 'bar');
      expect(redactedBar).not.toContain(tc.expectedPhone);
      expect(redactedBar).toContain('█');

      const redactedLabel = applyRedactionsToText(tc.text, findings, 'label');
      expect(redactedLabel).not.toContain(tc.expectedPhone);
      expect(redactedLabel).toContain('[PHONE]');

      const redactedPartial = applyRedactionsToText(tc.text, findings, 'partial');
      expect(redactedPartial).not.toContain(tc.expectedPhone);
      expect(redactedPartial).toContain('••••');
    });
  }

  it('should NOT redact invoice, order, or SKU codes as phone numbers', () => {
    const falsePositiveTexts = [
      'Invoice reference INV-2026-88129 has been processed.',
      'Order ID ORD-2026-99182 shipped via courier.',
      'Equipment serial number SKU-8891283 verified by QC.',
    ];

    for (const text of falsePositiveTexts) {
      const findings = detectPII(text, standardRuleSet);
      const phoneFinding = findings.find((f) => f.type === 'PHONE_NUMBER');
      expect(phoneFinding).toBeUndefined();
    }
  });
});
