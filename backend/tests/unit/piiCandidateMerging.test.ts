import { mergeCandidates } from '../../src/services/pii/utils/candidateMerger.utils';
import { RawDetectedCandidate } from '../../src/services/pii/detectors/detector.interface';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';

describe('PII Candidate Merging & Deduplication Unit Tests', () => {
  it('should remove exact duplicate candidates within the same block', () => {
    const candidates: RawDetectedCandidate[] = [
      {
        type: PIIType.EMAIL_ADDRESS,
        category: PIICategory.CONTACT_INFORMATION,
        text: 'user@example.com',
        normalizedValue: 'user@example.com',
        confidence: 0.98,
        detectionScore: 0.98,
        recognitionConfidence: 1.0,
        evidence: ['PATTERN_MATCH'],
        severity: PIISeverity.MEDIUM,
        sensitivityScore: 0.75,
        detectorName: 'EmailDetector',
        detectorType: 'DETERMINISTIC',
        startOffset: 10,
        endOffset: 26,
        blockId: 'block1',
        sourceType: 'NATIVE_TEXT',
      },
      {
        type: PIIType.EMAIL_ADDRESS,
        category: PIICategory.CONTACT_INFORMATION,
        text: 'user@example.com',
        normalizedValue: 'user@example.com',
        confidence: 0.98,
        detectionScore: 0.98,
        recognitionConfidence: 1.0,
        evidence: ['PATTERN_MATCH'],
        severity: PIISeverity.MEDIUM,
        sensitivityScore: 0.75,
        detectorName: 'EmailDetector',
        detectorType: 'DETERMINISTIC',
        startOffset: 10,
        endOffset: 26,
        blockId: 'block1',
        sourceType: 'NATIVE_TEXT',
      },
    ];

    const merged = mergeCandidates(candidates);
    expect(merged.length).toBe(1);
    expect(merged[0].text).toBe('user@example.com');
  });

  it('should prioritize DETERMINISTIC detectors over NER_MODEL for overlapping ranges', () => {
    const candidates: RawDetectedCandidate[] = [
      {
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: 'contact user@example.com',
        normalizedValue: 'contact user@example.com',
        confidence: 0.7,
        detectionScore: 0.7,
        recognitionConfidence: 1.0,
        evidence: ['NER_ENTITY_PER'],
        severity: PIISeverity.MEDIUM,
        sensitivityScore: 0.65,
        detectorName: 'NERDetector',
        detectorType: 'NER_MODEL',
        startOffset: 0,
        endOffset: 24,
        blockId: 'block1',
        sourceType: 'NATIVE_TEXT',
      },
      {
        type: PIIType.EMAIL_ADDRESS,
        category: PIICategory.CONTACT_INFORMATION,
        text: 'user@example.com',
        normalizedValue: 'user@example.com',
        confidence: 0.98,
        detectionScore: 0.98,
        recognitionConfidence: 1.0,
        evidence: ['PATTERN_MATCH'],
        severity: PIISeverity.MEDIUM,
        sensitivityScore: 0.75,
        detectorName: 'EmailDetector',
        detectorType: 'DETERMINISTIC',
        startOffset: 8,
        endOffset: 24,
        blockId: 'block1',
        sourceType: 'NATIVE_TEXT',
      },
    ];

    const merged = mergeCandidates(candidates);
    expect(merged.length).toBe(1);
    expect(merged[0].detectorType).toBe('DETERMINISTIC');
    expect(merged[0].type).toBe(PIIType.EMAIL_ADDRESS);
  });
});
