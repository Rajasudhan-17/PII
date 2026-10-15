import { IPIIDetector, RawDetectedCandidate, DetectionContext } from './detector.interface';
import { PIIType, getPIIMetadata } from '../../../config/piiTaxonomy';
import { calculateCandidateBoundingBox } from '../utils/boundingBox.utils';

export function isValidLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (isNaN(digit)) return false;

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

export class CreditCardDetector implements IPIIDetector {
  public name = 'CreditCardDetector';
  public version = '1.0.0';
  public type = 'DETERMINISTIC' as const;
  public supportedTypes = [PIIType.CREDIT_CARD_NUMBER];

  private CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;

  public async detect(
    text: string,
    context: DetectionContext
  ): Promise<RawDetectedCandidate[]> {
    const results: RawDetectedCandidate[] = [];
    if (!text) return results;

    const metadata = getPIIMetadata(PIIType.CREDIT_CARD_NUMBER);
    const block = context.block;
    const blockStartOffset = block ? block.startOffset : 0;
    const sourceType = block?.recognitionMethod || 'NATIVE_TEXT';
    const recConf = typeof block?.confidence === 'number' ? block.confidence : null;

    let match: RegExpExecArray | null;
    this.CARD_REGEX.lastIndex = 0;

    while ((match = this.CARD_REGEX.exec(text)) !== null) {
      const matchText = match[0];
      const digitsOnly = matchText.replace(/\D/g, '');

      if (!isValidLuhn(digitsOnly)) {
        continue;
      }

      const relativeStart = match.index;
      const relativeEnd = relativeStart + matchText.length;

      const absoluteStart = blockStartOffset + relativeStart;
      const absoluteEnd = blockStartOffset + relativeEnd;

      const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

      results.push({
        type: PIIType.CREDIT_CARD_NUMBER,
        category: metadata.category,
        text: matchText,
        normalizedValue: digitsOnly,
        confidence: 0.99,
        recognitionConfidence: recConf,
        detectionScore: 0.99,
        severity: metadata.defaultSeverity,
        sensitivityScore: metadata.defaultSensitivityScore,
        evidence: ['PATTERN_MATCH', 'LUHN_CHECKSUM_VALID'],
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
