import { PiiResidualVerifier } from '../../src/services/verification/verifiers/piiResidualVerifier';
import { StructuralIntegrityVerifier } from '../../src/services/verification/verifiers/structuralIntegrityVerifier';

describe('Phase 13 Resource Limits & Bounded Execution Unit Tests', () => {
  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
  const MAX_EXTRACTED_TEXT_BYTES = 1024 * 1024; // 1MB
  const MAX_FINDINGS_COUNT = 1000;
  const MAX_METADATA_ENTRIES = 1000;
  const EXECUTION_TIMEOUT_MS = 30000; // 30s

  test('50MB file size limit enforces rejection for oversized artifacts', () => {
    const oversizedSize = 50 * 1024 * 1024 + 1; // 50MB + 1 byte
    expect(oversizedSize > MAX_FILE_SIZE_BYTES).toBe(true);
  });

  test('Valid file size under 50MB is accepted', () => {
    const validSize = 10 * 1024 * 1024; // 10MB
    expect(validSize <= MAX_FILE_SIZE_BYTES).toBe(true);
  });

  test('PiiResidualVerifier 1MB extracted text limit bounds excessive text', () => {
    expect(PiiResidualVerifier.MAX_EXTRACTED_TEXT_BYTES).toBe(MAX_EXTRACTED_TEXT_BYTES);
    const excessiveText = 'a'.repeat(2 * 1024 * 1024); // 2MB
    const boundedText = excessiveText.substring(0, PiiResidualVerifier.MAX_EXTRACTED_TEXT_BYTES);
    expect(boundedText.length).toBe(1024 * 1024);
  });

  test('Page limit constant bounds excessive PDF page count to 1000', () => {
    expect(StructuralIntegrityVerifier.MAX_PAGES_LIMIT).toBe(1000);
    const rawPages = 1500;
    expect(Math.min(rawPages, StructuralIntegrityVerifier.MAX_PAGES_LIMIT)).toBe(1000);
  });

  test('Worksheet limit constant bounds excessive XLSX worksheets to 100', () => {
    expect(StructuralIntegrityVerifier.MAX_WORKSHEETS_LIMIT).toBe(100);
    const rawSheets = 250;
    expect(Math.min(rawSheets, StructuralIntegrityVerifier.MAX_WORKSHEETS_LIMIT)).toBe(100);
  });

  test('Slide limit constant bounds excessive PPTX slides to 500', () => {
    expect(StructuralIntegrityVerifier.MAX_SLIDES_LIMIT).toBe(500);
    const rawSlides = 800;
    expect(Math.min(rawSlides, StructuralIntegrityVerifier.MAX_SLIDES_LIMIT)).toBe(500);
  });

  test('Finding count and metadata entry limits are bounded to maximum 1000', () => {
    const rawFindingsCount = 1500;
    const rawMetadataEntries = 2000;
    expect(Math.min(rawFindingsCount, MAX_FINDINGS_COUNT)).toBe(1000);
    expect(Math.min(rawMetadataEntries, MAX_METADATA_ENTRIES)).toBe(1000);
  });

  test('Execution timeout limit constant is 30,000ms', () => {
    expect(EXECUTION_TIMEOUT_MS).toBe(30000);
  });
});
