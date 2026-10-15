import { ContextWindowExtractor } from '../../src/services/context/contextWindowExtractor';
import { IPIICandidate } from '../../src/models/piiCandidate.model';
import { INormalizedDocument } from '../../src/models/normalizedDocument.model';
import mongoose from 'mongoose';

describe('ContextWindowExtractor Unit Tests', () => {
  const dummyDoc = {
    documentId: new mongoose.Types.ObjectId(),
    organizationId: new mongoose.Types.ObjectId(),
    checksum: 'abc123hash',
    format: 'pdf',
    schemaVersion: '1.0.0',
    extractorVersion: '1.0.0',
    status: 'COMPLETE',
    pages: [{ pageNumber: 1, blockCount: 2 }],
    blocks: [
      {
        blockId: 'blk_1',
        type: 'PARAGRAPH',
        text: 'Customer Full Name: Jane Doe. Email: jane@example.com.',
        pageNumber: 1,
        readingOrderIndex: 0,
        startOffset: 0,
        endOffset: 53,
        provenance: {
          documentId: 'doc_1',
          organizationId: 'org_1',
          pageNumber: 1,
          blockId: 'blk_1',
        },
      },
      {
        blockId: 'blk_header',
        type: 'HEADER',
        text: 'Confidential Employee Document',
        pageNumber: 1,
        readingOrderIndex: 1,
        startOffset: 54,
        endOffset: 84,
        provenance: {
          documentId: 'doc_1',
          organizationId: 'org_1',
          pageNumber: 1,
          blockId: 'blk_header',
        },
      },
    ],
    tables: [],
    metadata: {},
    warnings: [],
  } as unknown as INormalizedDocument;

  test('should extract bounded context window from matching block', () => {
    const candidate = {
      candidateId: 'cand_1',
      text: 'Jane Doe',
      location: {
        startOffset: 20,
        endOffset: 28,
        blockId: 'blk_1',
        pageNumber: 1,
      },
    } as unknown as IPIICandidate;

    const res = ContextWindowExtractor.extractWindow(candidate, dummyDoc);
    expect(res.windowText).toContain('Jane Doe');
    expect(res.metadata.type).toBe('PARAGRAPH');
    expect(res.metadata.textLength).toBeLessThanOrEqual(250);
  });

  test('should label window as HEADER_FOOTER when candidate is in header block', () => {
    const candidate = {
      candidateId: 'cand_2',
      text: 'Confidential',
      location: {
        startOffset: 54,
        endOffset: 66,
        blockId: 'blk_header',
        pageNumber: 1,
      },
    } as unknown as IPIICandidate;

    const res = ContextWindowExtractor.extractWindow(candidate, dummyDoc);
    expect(res.metadata.type).toBe('HEADER_FOOTER');
  });
});
