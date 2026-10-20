import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  isValidLuhn,
  isValidVerhoeff,
  isValidIBAN,
  isValidUSSSN,
  computeSHA256,
  detectPII,
  applyRedactionsToText,
  generateSanitizedDocx,
  runVerificationChecks,
  parseUploadedFile,
} from '../services/realScanner';
import { RuleSet } from '../context/RedactContext';

describe('Real Scanner & Physical Redaction Engine', () => {
  const sampleRuleSet: RuleSet = {
    id: 'test-rule-set',
    name: 'Test Rule Set',
    isCustom: false,
    typeSummary: 'All 11 types',
    detectors: {
      names: true,
      emails: true,
      phones: true,
      dobs: true,
      addresses: true,
      cards: true,
      ibans: true,
      ssn: true,
      aadhaar: true,
      pan: true,
      api_keys: true,
    },
    alwaysRedact: ['Project Falcon', 'TOP_SECRET_CODE'],
    neverRedact: ['hr@northwind.example', 'Public Corp'],
    confidenceThreshold: 60,
    defaultLook: 'bar',
  };

  describe('1. Checksum & Number Validation Algorithms', () => {
    it('validates credit card numbers with Luhn algorithm', () => {
      // Valid Luhn cards (Visa test card)
      expect(isValidLuhn('4532015112830366')).toBe(true);
      expect(isValidLuhn('4532 0151 1283 0366')).toBe(true);

      // Invalid Luhn
      expect(isValidLuhn('4532015112830367')).toBe(false);
      expect(isValidLuhn('12345')).toBe(false);
    });

    it('validates Indian Aadhaar numbers with Verhoeff algorithm', () => {
      // Valid Verhoeff number
      expect(isValidVerhoeff('2345 6789 0124')).toBe(true);
      expect(isValidVerhoeff('234567890124')).toBe(true);

      // Invalid Verhoeff
      expect(isValidVerhoeff('234567890125')).toBe(false);
      expect(isValidVerhoeff('123412341234')).toBe(false);
    });

    it('validates IBANs with Mod-97 algorithm', () => {
      // Valid UK IBAN
      expect(isValidIBAN('GB82 WEST 1234 5698 7654 32')).toBe(true);
      expect(isValidIBAN('GB82WEST12345698765432')).toBe(true);

      // Invalid IBAN
      expect(isValidIBAN('GB82WEST12345698765433')).toBe(false);
      expect(isValidIBAN('INVALID')).toBe(false);
    });

    it('validates US Social Security Numbers', () => {
      expect(isValidUSSSN('123-45-6789')).toBe(true);
      expect(isValidUSSSN('123 45 6789')).toBe(true);

      // Invalid SSN area codes
      expect(isValidUSSSN('000-45-6789')).toBe(false);
      expect(isValidUSSSN('666-45-6789')).toBe(false);
      expect(isValidUSSSN('900-45-6789')).toBe(false);
    });
  });

  describe('2. Real PII Detection on Realistic Document Text', () => {
    it('accurately identifies real emails, phones, cards, PAN, and credentials', () => {
      const text = `
        Executive Briefing:
        Contact: sarah.connor@cyberdyne.org or call +1 555-019-2831.
        Corporate card: 4532 0151 1283 0366.
        Tax ID PAN: ABCDE1234F.
        AWS Secret: AKIAIOSFODNN7EXAMPLE.
        Classified initiative: Project Falcon.
        Support email: hr@northwind.example.
      `;

      const findings = detectPII(text, sampleRuleSet);

      const emailFinding = findings.find((f) => f.value === 'sarah.connor@cyberdyne.org');
      expect(emailFinding).toBeDefined();
      expect(emailFinding?.type).toBe('EMAIL_ADDRESS');
      expect(emailFinding?.status).toBe('redact');

      const phoneFinding = findings.find((f) => f.value.includes('555-019-2831'));
      expect(phoneFinding).toBeDefined();

      const cardFinding = findings.find((f) => f.value.replace(/\s+/g, '') === '4532015112830366');
      expect(cardFinding).toBeDefined();
      expect(cardFinding?.type).toBe('CREDIT_CARD');

      const panFinding = findings.find((f) => f.value === 'ABCDE1234F');
      expect(panFinding).toBeDefined();
      expect(panFinding?.type).toBe('PAN_NUMBER');

      const keyFinding = findings.find((f) => f.value === 'AKIAIOSFODNN7EXAMPLE');
      expect(keyFinding).toBeDefined();
      expect(keyFinding?.type).toBe('API_KEY');

      const alwaysRedact = findings.find((f) => f.value === 'Project Falcon');
      expect(alwaysRedact).toBeDefined();
      expect(alwaysRedact?.status).toBe('redact');

      const neverRedact = findings.find((f) => f.value === 'hr@northwind.example');
      expect(neverRedact).toBeDefined();
      expect(neverRedact?.status).toBe('keep');
    });

    it('respects detector toggles when a category is disabled', () => {
      const disabledRuleSet: RuleSet = {
        ...sampleRuleSet,
        detectors: {
          ...sampleRuleSet.detectors,
          emails: false,
          cards: false,
        },
      };

      const text = 'Reach us at contact@domain.com or use card 4532 0151 1283 0366.';
      const findings = detectPII(text, disabledRuleSet);

      expect(findings.some((f) => f.type === 'EMAIL_ADDRESS')).toBe(false);
      expect(findings.some((f) => f.type === 'CREDIT_CARD')).toBe(false);
    });
  });

  describe('3. Physical Text Redaction Application', () => {
    it('burns in black bars for bar look', () => {
      const original = 'Client email is alice@wonderland.com and phone is +91 98765 43210.';
      const findings = detectPII(original, sampleRuleSet);

      const redacted = applyRedactionsToText(original, findings, 'bar');
      expect(redacted).not.toContain('alice@wonderland.com');
      expect(redacted).toContain('████');
    });

    it('burns in labels for label look [LABEL]', () => {
      const original = 'Client email is alice@wonderland.com and PAN is ABCDE1234F.';
      const findings = detectPII(original, sampleRuleSet);

      const redacted = applyRedactionsToText(original, findings, 'label');
      expect(redacted).toContain('[EMAIL]');
      expect(redacted).toContain('[PAN]');
      expect(redacted).not.toContain('alice@wonderland.com');
      expect(redacted).not.toContain('ABCDE1234F');
    });

    it('burns in partial mask for partial look', () => {
      const original = 'Account PAN is ABCDE1234F.';
      const findings = detectPII(original, sampleRuleSet);

      const redacted = applyRedactionsToText(original, findings, 'partial');
      expect(redacted).toContain('•••• 234F');
      expect(redacted).not.toContain('ABCDE1234F');
    });
  });

  describe('4. Independent Verification QA Checks', () => {
    it('confirms 0 residual PII on cleanly redacted text', () => {
      const original = 'Contact user at john.doe@cyberdyne.org, PAN ABCDE1234F.';
      const findings = detectPII(original, sampleRuleSet);
      const redacted = applyRedactionsToText(original, findings, 'bar');

      const report = runVerificationChecks(original, redacted, findings, sampleRuleSet);
      expect(report.searchedOutput).toBe(true);
      expect(report.hiddenChecked).toBe(true);
      expect(report.residualCount).toBe(0);
      expect(report.fileOpens).toBe(true);
      expect(report.originalUntouched).toBe(true);
    });

    it('detects residual leakage if an unredacted token is still present in output', () => {
      const original = 'Secret key AKIAIOSFODNN7EXAMPLE was leaked.';
      const findings = detectPII(original, sampleRuleSet);
      // Malformed redacted text that failed to redact the key
      const leakyRedacted = 'Secret key AKIAIOSFODNN7EXAMPLE was leaked.';

      const report = runVerificationChecks(original, leakyRedacted, findings, sampleRuleSet);
      expect(report.hiddenChecked).toBe(false);
      expect(report.residualCount).toBeGreaterThan(0);
    });
  });

  describe('5. Real DOCX Binary Sanitization', () => {
    it('creates a sanitized DOCX zip, replaces XML text, and strips metadata', async () => {
      const zip = new JSZip();
      zip.file(
        'word/document.xml',
        '<?xml version="1.0" encoding="UTF-8"?><w:document><w:body><w:p><w:t>Email: support@secure.org</w:t></w:p></w:body></w:document>'
      );
      zip.file(
        'docProps/core.xml',
        '<?xml version="1.0"?><cp:coreProperties><dc:creator>John Doe</dc:creator><cp:lastModifiedBy>Jane Doe</cp:lastModifiedBy></cp:coreProperties>'
      );

      const findings = detectPII('Email: support@secure.org', sampleRuleSet);
      const sanitizedBlob = await generateSanitizedDocx(zip, findings, 'bar');

      expect(sanitizedBlob).toBeDefined();
      expect(sanitizedBlob.size).toBeGreaterThan(0);

      // Verify the generated zip
      const reloadedZip = await JSZip.loadAsync(await sanitizedBlob.arrayBuffer());
      const updatedDocXml = await reloadedZip.file('word/document.xml')?.async('text');
      expect(updatedDocXml).not.toContain('support@secure.org');
      expect(updatedDocXml).toContain('████');

      const updatedMetaXml = await reloadedZip.file('docProps/core.xml')?.async('text');
      expect(updatedMetaXml).not.toContain('John Doe');
      expect(updatedMetaXml).toContain('Redact Platform');
    });
  });

  describe('6. Cryptographic SHA-256 Hashing', () => {
    it('generates deterministic SHA-256 hex string for documents', async () => {
      const text = 'Confidential Redacted Document 2026';
      const hash1 = await computeSHA256(text);
      const hash2 = await computeSHA256(text);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
    });
  });

  describe('7. Uploaded File Parsing', () => {
    it('parses plain text files properly', async () => {
      const textContent = 'Hello World\nLine 2';
      const file = new File([textContent], 'test.txt', { type: 'text/plain' });

      const parsed = await parseUploadedFile(file);
      expect(parsed.format).toBe('TXT');
      expect(parsed.text).toBe(textContent);
      expect(parsed.lineCount).toBe(2);
    });

    it('parses real DOCX files extracting body text', async () => {
      const zip = new JSZip();
      zip.file(
        'word/document.xml',
        '<w:document><w:body><w:p><w:t>Confidential Report</w:t></w:p><w:p><w:t>Email: ceo@corp.com</w:t></w:p></w:body></w:document>'
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const file = new File([blob], 'report.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const parsed = await parseUploadedFile(file);
      expect(parsed.format).toBe('DOCX');
      expect(parsed.text).toContain('Confidential Report');
      expect(parsed.text).toContain('ceo@corp.com');
      expect(parsed.rawZip).toBeDefined();
    });
  });
});
