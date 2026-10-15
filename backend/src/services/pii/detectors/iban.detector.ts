import { IPIIDetector, RawDetectedCandidate, DetectionContext } from './detector.interface';
import { PIIType, getPIIMetadata } from '../../../config/piiTaxonomy';
import { calculateCandidateBoundingBox } from '../utils/boundingBox.utils';

export function isValidIBAN(iban: string): boolean {
  const clean = iban.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (clean.length < 15 || clean.length > 34) return false;

  const rearranged = clean.substring(4) + clean.substring(0, 4);
  let expanded = '';
  for (let i = 0; i < rearranged.length; i++) {
    const ch = rearranged.charCodeAt(i);
    if (ch >= 65 && ch <= 90) {
      expanded += (ch - 55).toString();
    } else {
      expanded += rearranged.charAt(i);
    }
  }

  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    remainder = (remainder * 10 + parseInt(expanded.charAt(i), 10)) % 97;
  }

  return remainder === 1;
}

export class IBANDetector implements IPIIDetector {
  public name = 'IBANDetector';
  public version = '1.0.0';
  public type = 'DETERMINISTIC' as const;
  public supportedTypes = [PIIType.IBAN];

  private IBAN_REGEX = /\b[A-Z]{2}\d{2}[A-Z0-9\s]{11,30}\b/gi;

  public async detect(
    text: string,
    context: DetectionContext
  ): Promise<RawDetectedCandidate[]> {
    const results: RawDetectedCandidate[] = [];
    if (!text) return results;

    const metadata = getPIIMetadata(PIIType.IBAN);
    const block = context.block;
    const blockStartOffset = block ? block.startOffset : 0;
    const sourceType = block?.recognitionMethod || 'NATIVE_TEXT';
    const recConf = typeof block?.confidence === 'number' ? block.confidence : null;

    let match: RegExpExecArray | null;
    this.IBAN_REGEX.lastIndex = 0;

    while ((match = this.IBAN_REGEX.exec(text)) !== null) {
      const matchText = match[0];
      const cleanIBAN = matchText.replace(/\s+/g, '').toUpperCase();

      if (!isValidIBAN(cleanIBAN)) {
        continue;
      }

      const relativeStart = match.index;
      const relativeEnd = relativeStart + matchText.length;

      const absoluteStart = blockStartOffset + relativeStart;
      const absoluteEnd = blockStartOffset + relativeEnd;

      const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

      results.push({
        type: PIIType.IBAN,
        category: metadata.category,
        text: matchText,
        normalizedValue: cleanIBAN,
        confidence: 0.99,
        recognitionConfidence: recConf,
        detectionScore: 0.99,
        severity: metadata.defaultSeverity,
        sensitivityScore: metadata.defaultSensitivityScore,
        evidence: ['PATTERN_MATCH', 'ISO_13616_MOD97_VALID'],
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
