import { LocalContextAnalyzer } from '../../src/services/context/contextAnalyzerProvider';
import { IPIICandidate } from '../../src/models/piiCandidate.model';
import { INormalizedDocument } from '../../src/models/normalizedDocument.model';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';
import mongoose from 'mongoose';

describe('Phase 08 Strict Invariant & Policy Boundaries Regression Tests', () => {
  const analyzer = new LocalContextAnalyzer();

  const dummyCandidate = {
    candidateId: 'cand_test_1',
    documentId: new mongoose.Types.ObjectId(),
    organizationId: new mongoose.Types.ObjectId(),
    type: PIIType.EMAIL_ADDRESS,
    category: PIICategory.CONTACT_INFORMATION,
    text: 'john@example.com',
    normalizedValue: 'john@example.com',
    confidence: 0.95,
    recognitionConfidence: 1.0,
    detectionScore: 0.95,
    severity: PIISeverity.MEDIUM,
    sensitivityScore: 0.75,
    evidence: ['PATTERN_MATCH'],
    detectorName: 'EmailDetector',
    detectorType: 'DETERMINISTIC',
    decision: null,
    isMasked: false,
    isRedacted: false,
    location: {
      startOffset: 0,
      endOffset: 16,
      blockId: 'blk_1',
      pageNumber: 1,
    },
    provenance: {
      sourceType: 'NATIVE_TEXT',
      blockId: 'blk_1',
    },
  } as unknown as IPIICandidate;

  const dummyDoc = {
    documentId: dummyCandidate.documentId,
    organizationId: dummyCandidate.organizationId,
    checksum: 'hash123',
    format: 'pdf',
    schemaVersion: '1.0.0',
    extractorVersion: '1.0.0',
    status: 'COMPLETE',
    pages: [{ pageNumber: 1, blockCount: 1 }],
    blocks: [
      {
        blockId: 'blk_1',
        type: 'PARAGRAPH',
        text: 'Email Address: john@example.com',
        pageNumber: 1,
        readingOrderIndex: 0,
        startOffset: 0,
        endOffset: 31,
        provenance: {
          documentId: 'doc1',
          organizationId: 'org1',
          pageNumber: 1,
          blockId: 'blk_1',
        },
      },
    ],
    tables: [],
    metadata: {},
    warnings: [],
  } as unknown as INormalizedDocument;

  test('STRICT INVARIANT: candidate.decision MUST remain null in Phase 08 context results', () => {
    const result = analyzer.analyzeCandidateContext(
      dummyCandidate,
      dummyDoc,
      [dummyCandidate],
      'cx_run_123'
    );

    expect(result.decision).toBeNull();
  });

  test('STRICT INVARIANT: candidate detectionScore and sensitivityScore MUST remain separate and untouched', () => {
    const result = analyzer.analyzeCandidateContext(
      dummyCandidate,
      dummyDoc,
      [dummyCandidate],
      'cx_run_123'
    );

    expect(dummyCandidate.detectionScore).toBe(0.95);
    expect(dummyCandidate.sensitivityScore).toBe(0.75);
    expect(result.contextualScore).toBeDefined();
    // contextualScore is separate from candidate match confidence
    expect(typeof result.contextualScore).toBe('number');
  });
});
