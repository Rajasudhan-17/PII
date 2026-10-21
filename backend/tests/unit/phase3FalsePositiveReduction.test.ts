import { NationalIDDetector } from '../../src/services/pii/detectors/nationalId.detector';
import { PhoneDetector } from '../../src/services/pii/detectors/phone.detector';
import { EmailDetector } from '../../src/services/pii/detectors/email.detector';
import { suppressContainedPhoneCandidates } from '../../src/services/pii/utils/candidateMerger.utils';
import { cleanAndValidatePersonName } from '../../src/services/pii/ner/presidio.provider';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';
import { RawDetectedCandidate } from '../../src/services/pii/detectors/detector.interface';

describe('Phase 3 — False Positive Reduction Unit Tests', () => {
  const dummyContext = {
    documentId: 'doc_test',
    organizationId: 'org_test',
  };

  describe('NationalIDDetector — SSN & Aadhaar Context Guards', () => {
    const detector = new NationalIDDetector();

    test('bare 9-digit number without SSN context is rejected (negative test)', async () => {
      const text = 'Your internal order confirmation number is 123456789. Please keep it safe.';
      const results = await detector.detect(text, dummyContext);
      const ssnResults = results.filter((r) => r.type === PIIType.US_SSN);
      expect(ssnResults.length).toBe(0);
    });

    test('bare 9-digit number with SSN context is detected (positive test)', async () => {
      const text = 'Primary Taxpayer SSN: 123456789 on the W-2 filing.';
      const results = await detector.detect(text, dummyContext);
      const ssnResults = results.filter((r) => r.type === PIIType.US_SSN);
      expect(ssnResults.length).toBe(1);
      expect(ssnResults[0].text).toBe('123456789');
    });

    test('formatted SSN without context remains detected (positive test)', async () => {
      const text = 'Filing reference code: 123-45-6789 in box 1.';
      const results = await detector.detect(text, dummyContext);
      const ssnResults = results.filter((r) => r.type === PIIType.US_SSN);
      expect(ssnResults.length).toBe(1);
      expect(ssnResults[0].text).toBe('123-45-6789');
    });

    test('unseparated 12-digit number without Aadhaar context is rejected (negative test)', async () => {
      // 234567890123 has valid Verhoeff checksum
      const text = 'Product serial barcode: 234567890123 dispatched from warehouse.';
      const results = await detector.detect(text, dummyContext);
      const aadhaarResults = results.filter((r) => r.type === PIIType.INDIAN_AADHAAR);
      expect(aadhaarResults.length).toBe(0);
    });

    test('unseparated 12-digit number with Aadhaar context is detected (positive test)', async () => {
      const text = 'Resident Aadhaar Number: 234567890123 verified via UIDAI portal.';
      const results = await detector.detect(text, dummyContext);
      const aadhaarResults = results.filter((r) => r.type === PIIType.INDIAN_AADHAAR);
      expect(aadhaarResults.length).toBe(1);
      expect(aadhaarResults[0].text).toBe('234567890123');
    });

    test('separated 12-digit Aadhaar with Verhoeff is detected (positive test)', async () => {
      // 2345 6789 0123 passes Verhoeff
      const text = 'Identity verification doc provided: 2345 6789 0123.';
      const results = await detector.detect(text, dummyContext);
      const aadhaarResults = results.filter((r) => r.type === PIIType.INDIAN_AADHAAR);
      expect(aadhaarResults.length).toBe(1);
      expect(aadhaarResults[0].text).toBe('2345 6789 0123');
    });

    test('credit card 16-digit block is NOT detected as Aadhaar (negative test)', async () => {
      const text = 'Corporate Expense Card: 4532 4332 1819 6006.';
      const results = await detector.detect(text, dummyContext);
      const aadhaarResults = results.filter((r) => r.type === PIIType.INDIAN_AADHAAR);
      expect(aadhaarResults.length).toBe(0);
    });
  });

  describe('PhoneDetector — Alphanumeric & Reference Context Hardening', () => {
    const detector = new PhoneDetector();

    test('alphanumeric tracking number is rejected (negative test)', async () => {
      const text = 'Courier Shipment Tracking: 1Z999AA10123456784.';
      const results = await detector.detect(text, dummyContext);
      expect(results.length).toBe(0);
    });

    test('AWB consignment number is rejected (negative test)', async () => {
      const text = 'Airway Bill Consignment: AWB 88129034567 delivered.';
      const results = await detector.detect(text, dummyContext);
      expect(results.length).toBe(0);
    });

    test('IPv4 address is rejected (negative test)', async () => {
      const text = 'Host System IP Address: 192.168.1.105 on LAN.';
      const results = await detector.detect(text, dummyContext);
      expect(results.length).toBe(0);
    });

    test('SSN formatted number (3-2-4) is rejected as phone (negative test)', async () => {
      const text = 'Social Security Number: 406-83-7518 recorded.';
      const results = await detector.detect(text, dummyContext);
      expect(results.length).toBe(0);
    });

    test('valid US phone numbers remain detected (positive test)', async () => {
      const text = 'Direct Contact: +1 (555) 123-4567 and Mobile: 555-234-5678.';
      const results = await detector.detect(text, dummyContext);
      expect(results.length).toBe(2);
      expect(results[0].text).toContain('555');
    });

    test('valid Indian phone numbers remain detected (positive test)', async () => {
      const text = 'Direct Contact: +91 91234 56789 or Landline: 044 24567890.';
      const results = await detector.detect(text, dummyContext);
      expect(results.length).toBe(2);
    });
  });

  describe('Overlapping Candidate Suppression (suppressContainedPhoneCandidates)', () => {
    test('suppresses phone candidate contained within credit card (negative test)', () => {
      const candidates: RawDetectedCandidate[] = [
        {
          type: PIIType.CREDIT_CARD_NUMBER,
          category: PIICategory.FINANCIAL_INFORMATION,
          text: '4532 4332 1819 6006',
          normalizedValue: '4532433218196006',
          confidence: 0.99,
          recognitionConfidence: null,
          detectionScore: 0.99,
          severity: PIISeverity.HIGH,
          sensitivityScore: 9,
          evidence: ['LUHN_VALID'],
          detectorName: 'CreditCardDetector',
          detectorType: 'DETERMINISTIC',
          startOffset: 24,
          endOffset: 43,
          sourceType: 'NATIVE_TEXT',
        },
        {
          type: PIIType.PHONE_NUMBER,
          category: PIICategory.CONTACT_INFORMATION,
          text: '4532 4332 1819',
          normalizedValue: '+453243321819',
          confidence: 0.9,
          recognitionConfidence: null,
          detectionScore: 0.9,
          severity: PIISeverity.MEDIUM,
          sensitivityScore: 6,
          evidence: ['PATTERN_MATCH'],
          detectorName: 'PhoneDetector',
          detectorType: 'DETERMINISTIC',
          startOffset: 24,
          endOffset: 38,
          sourceType: 'NATIVE_TEXT',
        },
      ];

      const filtered = suppressContainedPhoneCandidates(candidates);
      expect(filtered.length).toBe(1);
      expect(filtered[0].type).toBe(PIIType.CREDIT_CARD_NUMBER);
    });

    test('preserves legitimate standalone phone candidate (positive test)', () => {
      const candidates: RawDetectedCandidate[] = [
        {
          type: PIIType.CREDIT_CARD_NUMBER,
          category: PIICategory.FINANCIAL_INFORMATION,
          text: '4532 4332 1819 6006',
          normalizedValue: '4532433218196006',
          confidence: 0.99,
          recognitionConfidence: null,
          detectionScore: 0.99,
          severity: PIISeverity.HIGH,
          sensitivityScore: 9,
          evidence: ['LUHN_VALID'],
          detectorName: 'CreditCardDetector',
          detectorType: 'DETERMINISTIC',
          startOffset: 20,
          endOffset: 39,
          sourceType: 'NATIVE_TEXT',
        },
        {
          type: PIIType.PHONE_NUMBER,
          category: PIICategory.CONTACT_INFORMATION,
          text: '555-123-4567',
          normalizedValue: '+15551234567',
          confidence: 0.9,
          recognitionConfidence: null,
          detectionScore: 0.9,
          severity: PIISeverity.MEDIUM,
          sensitivityScore: 6,
          evidence: ['PATTERN_MATCH'],
          detectorName: 'PhoneDetector',
          detectorType: 'DETERMINISTIC',
          startOffset: 100,
          endOffset: 112,
          sourceType: 'NATIVE_TEXT',
        },
      ];

      const filtered = suppressContainedPhoneCandidates(candidates);
      expect(filtered.length).toBe(2);
      expect(filtered.some((c) => c.type === PIIType.PHONE_NUMBER)).toBe(true);
    });
  });

  describe('Name False-Positive Reduction & Guard Validations', () => {
    test('rejects product names like Kindle Paperwhite (negative test)', () => {
      const fullText = 'Amazon Kindle Paperwhite purchased today.';
      const res = cleanAndValidatePersonName('Kindle Paperwhite', 7, 24, fullText);
      expect(res).toBeNull();
    });

    test('rejects street names like Oak Avenue, Gandhi Road, Anna Salai (negative test)', () => {
      const t1 = 'Residential Address: 98 Oak Avenue, Houston';
      expect(cleanAndValidatePersonName('Oak Avenue', 24, 34, t1)).toBeNull();

      const t2 = 'Address: 71/8 Gandhi Road, Kochi';
      expect(cleanAndValidatePersonName('Gandhi Road', 14, 25, t2)).toBeNull();

      const t3 = 'Location: 141 Anna Salai, Pune';
      expect(cleanAndValidatePersonName('Anna Salai', 14, 24, t3)).toBeNull();
    });

    test('rejects obfuscated email handles (negative test)', () => {
      const text = 'Secondary Email: theodore [at] gmail [dot] com';
      const res = cleanAndValidatePersonName('theodore', 17, 25, text);
      expect(res).toBeNull();
    });

    test('rejects email with newline and label bleeding (negative test)', () => {
      const text = 'janaki.handa@patient-mail.example\nResidential Address';
      const res = cleanAndValidatePersonName(text, 0, text.length, text);
      expect(res).toBeNull();
    });

    test('trims trailing verbs from names (positive test)', () => {
      const text = 'Priya Venkatesh was admitted to the general ward.';
      const res = cleanAndValidatePersonName('Priya Venkatesh was', 0, 19, text);
      expect(res).not.toBeNull();
      expect(res?.text).toBe('Priya Venkatesh');
    });

    test('trims leading labels from names (positive test)', () => {
      const text = 'Contact Mr. Rajesh Sharma for admission details.';
      const res = cleanAndValidatePersonName('Contact Mr. Rajesh Sharma', 0, 25, text);
      expect(res).not.toBeNull();
      expect(res?.text).toBe('Mr. Rajesh Sharma');
    });

    test('preserves legitimate person name (positive test)', () => {
      const text = 'Consultant Dr. Robert Taylor reviewed the chart.';
      const res = cleanAndValidatePersonName('Robert Taylor', 15, 28, text);
      expect(res).not.toBeNull();
      expect(res?.text).toBe('Robert Taylor');
    });
  });

  describe('Email False-Positive Reduction — Policy & Context', () => {
    const detector = new EmailDetector();

    test('rejects generic support mailbox preceded by official support channel (negative test)', async () => {
      const text = 'Official Support Channel: helpdesk@service.example for general inquiries.';
      const results = await detector.detect(text, dummyContext);
      expect(results.length).toBe(0);
    });

    test('rejects generic info mailbox preceded by inquiries desk (negative test)', async () => {
      const text = 'Inquiries Desk: info@service.example All transactions are monitored.';
      const results = await detector.detect(text, dummyContext);
      expect(results.length).toBe(0);
    });

    test('preserves personal applicant email (positive test)', async () => {
      const text = 'Applicant Email: alyssa11@personal-box.example verified.';
      const results = await detector.detect(text, dummyContext);
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('alyssa11@personal-box.example');
    });

    test('preserves personal name email format (positive test)', async () => {
      const text = 'Primary Physician: robert.taylor@hospital-net.example in cardiology.';
      const results = await detector.detect(text, dummyContext);
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('robert.taylor@hospital-net.example');
    });
  });
});
