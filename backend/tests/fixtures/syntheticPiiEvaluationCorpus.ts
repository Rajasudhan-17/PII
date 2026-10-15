import { PIIType } from '../../src/config/piiTaxonomy';

export interface LabeledSyntheticExample {
  id: string;
  text: string;
  expectedType: PIIType | null; // null if negative example
  expectedValue?: string;
  isOcrCorrupted?: boolean;
  isHandwritten?: boolean;
  isAmbiguous?: boolean;
  description: string;
}

export const SYNTHETIC_EVALUATION_CORPUS: LabeledSyntheticExample[] = [
  // --- EMAIL ADDRESS POSITIVES & NEGATIVES ---
  { id: 'em_pos_1', text: 'Contact user john.doe@example.com for help.', expectedType: PIIType.EMAIL_ADDRESS, expectedValue: 'john.doe@example.com', description: 'Valid standard email' },
  { id: 'em_pos_2', text: 'Send support request to support@company.co.uk today.', expectedType: PIIType.EMAIL_ADDRESS, expectedValue: 'support@company.co.uk', description: 'Valid UK tld email' },
  { id: 'em_neg_1', text: 'Refer to section @example.com or user@.', expectedType: null, description: 'Malformed email syntax' },
  { id: 'em_neg_2', text: 'Invoice # 12345-6789 created on 2026-09-15.', expectedType: null, description: 'Invoice number with date' },

  // --- PHONE NUMBER POSITIVES & NEGATIVES ---
  { id: 'ph_pos_1', text: 'Call us at +1-800-555-0199 for urgent support.', expectedType: PIIType.PHONE_NUMBER, expectedValue: '+1-800-555-0199', description: 'Valid US phone number' },
  { id: 'ph_pos_2', text: 'Direct line (415) 555-2671 available 24/7.', expectedType: PIIType.PHONE_NUMBER, expectedValue: '(415) 555-2671', description: 'Valid parenthesized US phone' },
  { id: 'ph_neg_1', text: 'Report generated on 2026-09-15 14:30:00.', expectedType: null, description: 'Date timestamp string' },
  { id: 'ph_neg_2', text: 'Order ID 9876-5432-10.', expectedType: null, description: 'Order ID format' },

  // --- CREDIT CARD POSITIVES & NEGATIVES (LUHN CHECKSUM) ---
  { id: 'cc_pos_1', text: 'Card ending in 4532-0151-1283-0366.', expectedType: PIIType.CREDIT_CARD_NUMBER, expectedValue: '4532-0151-1283-0366', description: 'Valid Visa Luhn card' },
  { id: 'cc_neg_1', text: 'Card number 4532-0151-1283-0367 is invalid.', expectedType: null, description: 'Invalid Luhn checksum card' },

  // --- IBAN POSITIVES & NEGATIVES (MOD-97 CHECKSUM) ---
  { id: 'iban_pos_1', text: 'Wire funds to GB82 WEST 1234 5698 7654 32.', expectedType: PIIType.IBAN, expectedValue: 'GB82WEST12345698765432', description: 'Valid UK IBAN' },
  { id: 'iban_neg_1', text: 'Reference GB82 WEST 1234 5698 7654 99.', expectedType: null, description: 'Invalid MOD-97 IBAN' },

  // --- US SSN POSITIVES & NEGATIVES ---
  { id: 'ssn_pos_1', text: 'SSN on record is 123-45-6789.', expectedType: PIIType.US_SSN, expectedValue: '123-45-6789', description: 'Valid US SSN' },
  { id: 'ssn_neg_1', text: 'SSN 000-45-6789 is invalid due to area 000.', expectedType: null, description: 'Invalid SSN area code 000' },
  { id: 'ssn_neg_2', text: 'SSN 666-45-6789 is invalid due to area 666.', expectedType: null, description: 'Invalid SSN area code 666' },

  // --- INDIAN PAN POSITIVES & NEGATIVES ---
  { id: 'pan_pos_1', text: 'PAN card holder: ABCDE1234F.', expectedType: PIIType.INDIAN_PAN, expectedValue: 'ABCDE1234F', description: 'Valid Indian PAN' },
  { id: 'pan_neg_1', text: 'Serial number ABCDE12345 is not a PAN.', expectedType: null, description: 'Invalid PAN structure' },

  // --- INDIAN AADHAAR POSITIVES & NEGATIVES (VERHOEFF CHECKSUM) ---
  { id: 'aadhaar_pos_1', text: 'Aadhaar ID 3675 9834 5673 verified.', expectedType: PIIType.INDIAN_AADHAAR, expectedValue: '3675 9834 5673', description: 'Valid Indian Aadhaar with Verhoeff checksum' },
  { id: 'aadhaar_neg_1', text: 'ID 3675 9834 5674 failed Verhoeff checksum.', expectedType: null, description: 'Invalid Aadhaar Verhoeff checksum' },

  // --- AUTH SECURITY KEYS POSITIVES & NEGATIVES ---
  { id: 'auth_pos_1', text: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', expectedType: PIIType.AUTH_TOKEN_KEY, expectedValue: 'AKIAIOSFODNN7EXAMPLE', description: 'Valid AWS Access Key ID' },
  { id: 'auth_neg_1', text: 'Product SKU AKIAIOSFODNN7.', expectedType: null, description: 'Short non-key product SKU' },

  // --- OCR CORRUPTED EXAMPLES ---
  { id: 'ocr_corr_1', text: 'C0ntact john.doe@examp1e.com for info.', expectedType: PIIType.EMAIL_ADDRESS, isOcrCorrupted: true, description: 'OCR l/1 corrupted email' },
  { id: 'ocr_corr_2', text: 'Call us at +1-800-SSS-0199.', expectedType: null, isOcrCorrupted: true, description: 'OCR corrupted phone number' },

  // --- HANDWRITING HTR EXAMPLES ---
  { id: 'htr_pos_1', text: 'Handwritten note: Email jane.smith@htr.org', expectedType: PIIType.EMAIL_ADDRESS, isHandwritten: true, description: 'HTR extracted email address' },

  // --- AMBIGUOUS EXAMPLES ---
  { id: 'amb_1', text: 'Account number 9876543210.', expectedType: null, isAmbiguous: true, description: 'Ambiguous generic account number' },
];
