import { IPIIDetector, RawDetectedCandidate, DetectionContext } from './detector.interface';
import { PIIType, getPIIMetadata } from '../../../config/piiTaxonomy';
import { calculateCandidateBoundingBox } from '../utils/boundingBox.utils';

export class PassportDetector implements IPIIDetector {
  public name = 'PassportDetector';
  public version = '1.0.0';
  public type = 'DETERMINISTIC' as const;
  public supportedTypes = [PIIType.PASSPORT];

  // Indian passport format: 1 uppercase letter followed by 7 digits
  // Common international passport: 1 letter followed by 7 to 8 digits
  private PASSPORT_REGEX = /\b([A-Z][0-9]{7})\b/g;

  // Context required within ~45 characters preceding (or following) the match
  private PASSPORT_CONTEXT_REGEX =
    /\b(?:passport(?:\s+(?:number|no\.?|num|id|card))?|travel\s+document|republic\s+of\s+india\s+passport)\b/i;

  // Negative context that disqualifies the candidate as a passport
  private NEGATIVE_CONTEXT_REGEX =
    /\b(?:tracking|shipment|awb|consignment|order|invoice|sku|part\s*no|serial|ticket|batch|ref(?:erence)?)\b/i;

  public async detect(
    text: string,
    context: DetectionContext
  ): Promise<RawDetectedCandidate[]> {
    const results: RawDetectedCandidate[] = [];
    if (!text) return results;

    const metadata = getPIIMetadata(PIIType.PASSPORT);
    const block = context.block;
    const blockStartOffset = block ? block.startOffset : 0;
    const sourceType = block?.recognitionMethod || 'NATIVE_TEXT';
    const recConf = typeof block?.confidence === 'number' ? block.confidence : null;

    let match: RegExpExecArray | null;
    this.PASSPORT_REGEX.lastIndex = 0;

    while ((match = this.PASSPORT_REGEX.exec(text)) !== null) {
      const matchText = match[1];
      const relativeStart = match.index;
      const relativeEnd = relativeStart + matchText.length;

      // Check context in preceding 45 characters and following 20 characters
      const preceding = text.slice(Math.max(0, relativeStart - 45), relativeStart);
      const following = text.slice(relativeEnd, Math.min(text.length, relativeEnd + 20));

      // Reject if explicit non-passport identifier context is present
      if (this.NEGATIVE_CONTEXT_REGEX.test(preceding)) {
        continue;
      }

      // Require passport context to distinguish from arbitrary 8-char codes
      const hasPrecedingContext = this.PASSPORT_CONTEXT_REGEX.test(preceding);
      const hasFollowingContext = this.PASSPORT_CONTEXT_REGEX.test(following);

      if (!hasPrecedingContext && !hasFollowingContext) {
        continue;
      }

      const absoluteStart = blockStartOffset + relativeStart;
      const absoluteEnd = blockStartOffset + relativeEnd;
      const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

      results.push({
        type: PIIType.PASSPORT,
        category: metadata.category,
        text: matchText,
        normalizedValue: matchText.toUpperCase(),
        confidence: 0.95,
        recognitionConfidence: recConf,
        detectionScore: 0.95,
        severity: metadata.defaultSeverity,
        sensitivityScore: metadata.defaultSensitivityScore,
        evidence: ['PATTERN_MATCH', 'CONTEXT_CONFIRMATION'],
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
