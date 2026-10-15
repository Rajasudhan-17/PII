import { EmailDetector } from '../../src/services/pii/detectors/email.detector';
import { PhoneDetector } from '../../src/services/pii/detectors/phone.detector';
import { CreditCardDetector, isValidLuhn } from '../../src/services/pii/detectors/creditCard.detector';
import { IBANDetector, isValidIBAN } from '../../src/services/pii/detectors/iban.detector';
import { AuthSecurityDetector } from '../../src/services/pii/detectors/authSecurity.detector';
import { NationalIDDetector, isValidVerhoeff, isValidUSSSN } from '../../src/services/pii/detectors/nationalId.detector';
import { PIIType } from '../../src/config/piiTaxonomy';

describe('PII Detectors Unit Tests', () => {
  const dummyContext = { documentId: 'doc123', organizationId: 'org123' };

  describe('EmailDetector', () => {
    const detector = new EmailDetector();

    it('should detect valid email addresses with offsets', async () => {
      const text = 'Contact us at user@example.com or admin@test.org for support.';
      const results = await detector.detect(text, dummyContext);

      expect(results.length).toBe(2);
      expect(results[0].type).toBe(PIIType.EMAIL_ADDRESS);
      expect(results[0].text).toBe('user@example.com');
      expect(results[0].startOffset).toBe(14);
      expect(results[0].endOffset).toBe(30);

      expect(results[1].text).toBe('admin@test.org');
    });
  });

  describe('PhoneDetector', () => {
    const detector = new PhoneDetector();

    it('should detect formatted phone numbers and normalize to E.164 format', async () => {
      const text = 'Call +1-800-555-0199 or (555) 019-2831 today.';
      const results = await detector.detect(text, dummyContext);

      expect(results.length).toBe(2);
      expect(results[0].type).toBe(PIIType.PHONE_NUMBER);
      expect(results[0].normalizedValue).toBe('+18005550199');
    });

    it('should ignore dates like 2026-09-15', async () => {
      const text = 'The event is scheduled for 2026-09-15.';
      const results = await detector.detect(text, dummyContext);

      expect(results.length).toBe(0);
    });
  });

  describe('CreditCardDetector & Luhn Algorithm', () => {
    const detector = new CreditCardDetector();

    it('should validate Luhn algorithm correctly', () => {
      expect(isValidLuhn('4532015112830366')).toBe(true);
      expect(isValidLuhn('4532015112830367')).toBe(false);
    });

    it('should detect valid credit card numbers and reject invalid Luhn cards', async () => {
      const text = 'Card A: 4532-0151-1283-0366, Card B: 4532-0151-1283-0367';
      const results = await detector.detect(text, dummyContext);

      expect(results.length).toBe(1);
      expect(results[0].type).toBe(PIIType.CREDIT_CARD_NUMBER);
      expect(results[0].normalizedValue).toBe('4532015112830366');
    });
  });

  describe('IBANDetector & MOD-97 Checksum', () => {
    const detector = new IBANDetector();

    it('should validate IBAN MOD-97-10 checksum', () => {
      expect(isValidIBAN('GB82 WEST 1234 5698 7654 32')).toBe(true);
      expect(isValidIBAN('GB82 WEST 1234 5698 7654 33')).toBe(false);
    });

    it('should detect valid IBANs', async () => {
      const text = 'Transfer funds to IBAN GB82 WEST 1234 5698 7654 32 immediately.';
      const results = await detector.detect(text, dummyContext);

      expect(results.length).toBe(1);
      expect(results[0].type).toBe(PIIType.IBAN);
    });
  });

  describe('AuthSecurityDetector', () => {
    const detector = new AuthSecurityDetector();

    it('should detect AWS Access Keys and JWT Tokens', async () => {
      const text = 'AWS Key: AKIAIOSFODNN7EXAMPLE and JWT: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const results = await detector.detect(text, dummyContext);

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.text.includes('AKIAIOSFODNN7EXAMPLE'))).toBe(true);
    });
  });

  describe('NationalIDDetector (SSN, PAN, Aadhaar Verhoeff)', () => {
    const detector = new NationalIDDetector();

    it('should validate US SSN rules', () => {
      expect(isValidUSSSN('666-12-3456')).toBe(false); // Invalid area 666
      expect(isValidUSSSN('219-09-8901')).toBe(true);
    });

    it('should validate Indian Aadhaar Verhoeff checksum', () => {
      expect(isValidVerhoeff('367598345673')).toBe(true);
      expect(isValidVerhoeff('367598345674')).toBe(false);
    });

    it('should detect US SSN, Indian PAN, and Indian Aadhaar', async () => {
      const text = 'SSN: 219-09-8901, PAN: ABCDE1234F, Aadhaar: 367598345673';
      const results = await detector.detect(text, dummyContext);

      expect(results.length).toBe(3);
      expect(results.some((r) => r.type === PIIType.US_SSN)).toBe(true);
      expect(results.some((r) => r.type === PIIType.INDIAN_PAN)).toBe(true);
      expect(results.some((r) => r.type === PIIType.INDIAN_AADHAAR)).toBe(true);
    });
  });
});
