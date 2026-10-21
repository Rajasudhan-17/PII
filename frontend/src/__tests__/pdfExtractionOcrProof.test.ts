import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import {
  extractPdfText,
  generateSanitizedPdf,
  detectPII,
} from '../services/realScanner';
import { RuleSet } from '../context/RedactContext';

const testRuleSet: RuleSet = {
  id: 'standard',
  name: 'Standard PII',
  defaultLook: 'bar',
  isCustom: false,
  typeSummary: 'Standard PII Suite',
  alwaysRedact: [],
  neverRedact: [],
  confidenceThreshold: 50,
  detectors: {
    emails: true,
    phones: true,
    names: true,
    dobs: true,
    addresses: true,
    cards: true,
    ibans: true,
    ssn: true,
    aadhaar: true,
    pan: true,
    api_keys: true,
  },
};

describe('PDF Extraction, OCR & Unrecoverable Redaction Proof', () => {
  const samplePdfPath = path.resolve(
    __dirname,
    '../../../backend/sample_docs/sample_synthetic_medical_report_pii.pdf'
  );

  it('extracts real document text from PDF without returning raw PDF bytecode (%PDF-1.4 / 1 0 obj)', async () => {
    const fileBytes = fs.readFileSync(samplePdfPath);
    const arrayBuffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    const extraction = await extractPdfText(arrayBuffer);

    // 1. MUST NOT contain raw PDF syntax
    expect(extraction.text).not.toContain('%PDF-1.4');
    expect(extraction.text).not.toContain('1 0 obj');
    expect(extraction.text).not.toContain('/BaseFont /Helvetica');
    expect(extraction.text).not.toContain('endobj');

    // 2. MUST contain actual document content
    expect(extraction.text).toContain('SAMPLE MEDICAL REPORT');
    expect(extraction.text).toContain('Aarav Example');
    expect(extraction.text).toContain('14 February 1998');
    expect(extraction.text).toContain('aarav.example@example.test');
    expect(extraction.lineCount).toBeGreaterThan(10);
  });

  it('detects sensitive PII entities in the extracted PDF text', async () => {
    const fileBytes = fs.readFileSync(samplePdfPath);
    const arrayBuffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    const extraction = await extractPdfText(arrayBuffer);
    const findings = detectPII(extraction.text, testRuleSet);

    expect(findings.length).toBeGreaterThan(0);

    // Verify email detection
    const emailFinding = findings.find((f) => f.value.includes('aarav.example@example.test'));
    expect(emailFinding).toBeDefined();
    expect(emailFinding?.type).toBe('EMAIL_ADDRESS');

    // Verify name detection
    const nameFinding = findings.find((f) => f.value.includes('Aarav Example'));
    expect(nameFinding).toBeDefined();
  });

  it('physically sanitizes the PDF stream so original PII cannot be recovered from the exported PDF', async () => {
    const fileBytes = fs.readFileSync(samplePdfPath);
    const arrayBuffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    const extraction = await extractPdfText(arrayBuffer);
    const findings = detectPII(extraction.text, testRuleSet);

    // Mark all findings for physical redaction
    const redactFindings = findings.map((f) => ({ ...f, status: 'redact' as const }));

    const originalBytes = new Uint8Array(fileBytes);
    const sanitizedBytes = generateSanitizedPdf(originalBytes, redactFindings, 'bar');

    // 1. Re-parse the sanitized PDF with pdfjs to ensure it remains a valid document
    const doc = await pdfjsLib.getDocument({
      data: sanitizedBytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;

    expect(doc.numPages).toBe(2);

    // 2. Extract text from the sanitized PDF
    let sanitizedText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      sanitizedText += ' ' + content.items.map((it: any) => it.str).join(' ');
    }

    // 3. PROOF: Target PII is physically unrecoverable from the exported PDF
    expect(sanitizedText).not.toContain('Aarav Example');
    expect(sanitizedText).not.toContain('aarav.example@example.test');
  });
});
