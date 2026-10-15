import { initializeDefaultDetectors } from '../../src/services/pii/detectors';
import { PIIType } from '../../src/config/piiTaxonomy';

describe('HTR & OCR Recognition Confidence Semantics Unit Tests', () => {
  const registry = initializeDefaultDetectors();

  it('should assign recognitionConfidence = null for candidates from HANDWRITING_HTR (TrOCR) blocks without manufactured scores', async () => {
    const text = 'Handwritten note: email contact user@example.com';
    const { candidates } = await registry.runAll(text, {
      documentId: 'doc_htr',
      organizationId: 'org_htr',
      block: {
        blockId: 'blk_htr_1',
        type: 'PARAGRAPH',
        text,
        pageNumber: 1,
        readingOrderIndex: 0,
        startOffset: 0,
        endOffset: text.length,
        recognitionMethod: 'HANDWRITING_HTR',
        confidence: null, // TrOCR outputs raw text without line/token confidence calibration
        provenance: { documentId: 'doc_htr', organizationId: 'org_htr', pageNumber: 1, blockId: 'blk_htr_1' },
      },
    });

    expect(candidates.length).toBeGreaterThan(0);
    const emailCandidate = candidates.find((c) => c.type === PIIType.EMAIL_ADDRESS);
    expect(emailCandidate).toBeDefined();

    // HTR recognition confidence MUST be null (never 1.0, never token count, never manufactured)
    expect(emailCandidate!.recognitionConfidence).toBeNull();

    // Match detectionScore MUST still reflect PII detector match confidence (0.98 for email)
    expect(emailCandidate!.detectionScore).toBe(0.98);
  });

  it('should assign recognitionConfidence = 1.0 for NATIVE_TEXT blocks representing source extraction fidelity', async () => {
    const text = 'Native document text: email user@example.com';
    const { candidates } = await registry.runAll(text, {
      documentId: 'doc_native',
      organizationId: 'org_native',
      block: {
        blockId: 'blk_native_1',
        type: 'PARAGRAPH',
        text,
        pageNumber: 1,
        readingOrderIndex: 0,
        startOffset: 0,
        endOffset: text.length,
        recognitionMethod: 'NATIVE_TEXT',
        confidence: 1.0,
        provenance: { documentId: 'doc_native', organizationId: 'org_native', pageNumber: 1, blockId: 'blk_native_1' },
      },
    });

    expect(candidates.length).toBeGreaterThan(0);
    const emailCandidate = candidates.find((c) => c.type === PIIType.EMAIL_ADDRESS);
    expect(emailCandidate).toBeDefined();
    expect(emailCandidate!.recognitionConfidence).toBe(1.0);
  });

  it('should assign recognitionConfidence from Tesseract block confidence for PRINT_OCR blocks', async () => {
    const text = 'OCR document text: email user@example.com';
    const { candidates } = await registry.runAll(text, {
      documentId: 'doc_ocr',
      organizationId: 'org_ocr',
      block: {
        blockId: 'blk_ocr_1',
        type: 'PARAGRAPH',
        text,
        pageNumber: 1,
        readingOrderIndex: 0,
        startOffset: 0,
        endOffset: text.length,
        recognitionMethod: 'PRINT_OCR',
        confidence: 0.88,
        provenance: { documentId: 'doc_ocr', organizationId: 'org_ocr', pageNumber: 1, blockId: 'blk_ocr_1' },
      },
    });

    expect(candidates.length).toBeGreaterThan(0);
    const emailCandidate = candidates.find((c) => c.type === PIIType.EMAIL_ADDRESS);
    expect(emailCandidate).toBeDefined();
    expect(emailCandidate!.recognitionConfidence).toBe(0.88);
  });
});
