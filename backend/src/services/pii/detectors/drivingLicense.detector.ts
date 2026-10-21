import { IPIIDetector, RawDetectedCandidate, DetectionContext } from './detector.interface';
import { PIIType, getPIIMetadata } from '../../../config/piiTaxonomy';
import { calculateCandidateBoundingBox } from '../utils/boundingBox.utils';

// Valid 2-letter codes for Indian States and Union Territories
const INDIAN_STATE_CODES = new Set([
  'AN', 'AP', 'AR', 'AS', 'BR', 'CH', 'CG', 'DD', 'DL', 'DN', 'GA', 'GJ',
  'HR', 'HP', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP',
  'MZ', 'NL', 'OD', 'PB', 'PY', 'RJ', 'SK', 'TN', 'TR', 'TS', 'UK', 'UP', 'WB'
]);

export class DrivingLicenseDetector implements IPIIDetector {
  public name = 'DrivingLicenseDetector';
  public version = '1.0.0';
  public type = 'DETERMINISTIC' as const;
  public supportedTypes = [PIIType.DRIVING_LICENSE];

  // Indian DL format: SS-RR YYYYNNNNNNN or SSRRYYYYNNNNNNN
  // e.g., "TN09 20110012345", "DL21 20191054447", "TN-09-20110012345"
  private DL_REGEX = /\b([A-Z]{2}[- ]?[0-9]{2}[- ]?(?:19|20)\d{2}[- ]?\d{7})\b/g;

  // Context required within ~45 characters preceding (or following) the match
  private DL_CONTEXT_REGEX =
    /\b(?:driving\s+licen[cs]e|driver'?s?\s+licen[cs]e|dl\s*(?:no\.?|num|number)?|licen[cs]e\s*(?:no\.?|num|number)|dl)\b/i;

  // Negative context that disqualifies the candidate as a driving licence
  private NEGATIVE_CONTEXT_REGEX =
    /\b(?:tracking|shipment|awb|consignment|order|invoice|sku|part\s*no|serial|ticket|batch|ref(?:erence)?)\b/i;

  public async detect(
    text: string,
    context: DetectionContext
  ): Promise<RawDetectedCandidate[]> {
    const results: RawDetectedCandidate[] = [];
    if (!text) return results;

    const metadata = getPIIMetadata(PIIType.DRIVING_LICENSE);
    const block = context.block;
    const blockStartOffset = block ? block.startOffset : 0;
    const sourceType = block?.recognitionMethod || 'NATIVE_TEXT';
    const recConf = typeof block?.confidence === 'number' ? block.confidence : null;

    let match: RegExpExecArray | null;
    this.DL_REGEX.lastIndex = 0;

    while ((match = this.DL_REGEX.exec(text)) !== null) {
      const matchText = match[1];
      const relativeStart = match.index;
      const relativeEnd = relativeStart + matchText.length;

      // Validate state code
      const stateCode = matchText.slice(0, 2).toUpperCase();
      if (!INDIAN_STATE_CODES.has(stateCode)) {
        continue;
      }

      // Check context in preceding 45 characters and following 20 characters
      const preceding = text.slice(Math.max(0, relativeStart - 45), relativeStart);
      const following = text.slice(relativeEnd, Math.min(text.length, relativeEnd + 20));

      if (this.NEGATIVE_CONTEXT_REGEX.test(preceding)) {
        continue;
      }

      const hasPrecedingContext = this.DL_CONTEXT_REGEX.test(preceding);
      const hasFollowingContext = this.DL_CONTEXT_REGEX.test(following);

      if (!hasPrecedingContext && !hasFollowingContext) {
        continue;
      }

      const absoluteStart = blockStartOffset + relativeStart;
      const absoluteEnd = blockStartOffset + relativeEnd;
      const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

      results.push({
        type: PIIType.DRIVING_LICENSE,
        category: metadata.category,
        text: matchText,
        normalizedValue: matchText.replace(/[- ]+/g, ' ').toUpperCase(),
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
