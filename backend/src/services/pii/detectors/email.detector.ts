import { IPIIDetector, RawDetectedCandidate, DetectionContext } from './detector.interface';
import { PIIType, getPIIMetadata } from '../../../config/piiTaxonomy';
import { calculateCandidateBoundingBox } from '../utils/boundingBox.utils';

export class EmailDetector implements IPIIDetector {
  public name = 'EmailDetector';
  public version = '1.0.0';
  public type = 'DETERMINISTIC' as const;
  public supportedTypes = [PIIType.EMAIL_ADDRESS];

  // Practical standard email regex capturing user@domain.tld, excluding trailing punctuation
  private EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

  public async detect(
    text: string,
    context: DetectionContext
  ): Promise<RawDetectedCandidate[]> {
    const results: RawDetectedCandidate[] = [];
    if (!text) return results;

    const metadata = getPIIMetadata(PIIType.EMAIL_ADDRESS);
    const block = context.block;
    const blockStartOffset = block ? block.startOffset : 0;
    const sourceType = block?.recognitionMethod || 'NATIVE_TEXT';
    const recConf = typeof block?.confidence === 'number' ? block.confidence : null;

    let match: RegExpExecArray | null;
    this.EMAIL_REGEX.lastIndex = 0;

    while ((match = this.EMAIL_REGEX.exec(text)) !== null) {
      let matchText = match[0];
      // Strip trailing punctuation if accidentally captured
      matchText = matchText.replace(/[.,;:!?)]+$/, '');

      const relativeStart = match.index;
      const relativeEnd = relativeStart + matchText.length;

      // Precision guard: generic organizational mailboxes are non-personal corporate contacts
      if (/^(?:support|sales|info|contact|help|billing|marketing|careers|press)@/i.test(matchText)) {
        continue;
      }

      const absoluteStart = blockStartOffset + relativeStart;
      const absoluteEnd = blockStartOffset + relativeEnd;

      const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

      results.push({
        type: PIIType.EMAIL_ADDRESS,
        category: metadata.category,
        text: matchText,
        normalizedValue: matchText.toLowerCase(),
        confidence: 0.98,
        recognitionConfidence: recConf,
        detectionScore: 0.98,
        severity: metadata.defaultSeverity,
        sensitivityScore: metadata.defaultSensitivityScore,
        evidence: ['PATTERN_MATCH'],
        detectorName: this.name,
        detectorType: this.type,
        startOffset: absoluteStart,
        endOffset: absoluteEnd,
        pageNumber: block?.pageNumber,
        blockId: block?.blockId || 'FULL_TEXT',
        boundingBox: bbox || null,
        sourceType,
      });
    }

    return results;
  }
}
