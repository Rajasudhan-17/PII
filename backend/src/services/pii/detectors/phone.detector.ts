import { IPIIDetector, RawDetectedCandidate, DetectionContext } from './detector.interface';
import { PIIType, getPIIMetadata } from '../../../config/piiTaxonomy';
import { calculateCandidateBoundingBox } from '../utils/boundingBox.utils';

export class PhoneDetector implements IPIIDetector {
  public name = 'PhoneDetector';
  public version = '1.0.0';
  public type = 'DETERMINISTIC' as const;
  public supportedTypes = [PIIType.PHONE_NUMBER];

  private PHONE_REGEX =
    /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}\b|\+?\d{1,4}[-.\s]?(?:\d[-.\s]?){6,12}\d\b/g;

  public async detect(
    text: string,
    context: DetectionContext
  ): Promise<RawDetectedCandidate[]> {
    const results: RawDetectedCandidate[] = [];
    if (!text) return results;

    const metadata = getPIIMetadata(PIIType.PHONE_NUMBER);
    const block = context.block;
    const blockStartOffset = block ? block.startOffset : 0;
    const sourceType = block?.recognitionMethod || 'NATIVE_TEXT';
    const recConf = typeof block?.confidence === 'number' ? block.confidence : null;

    let match: RegExpExecArray | null;
    this.PHONE_REGEX.lastIndex = 0;

    while ((match = this.PHONE_REGEX.exec(text)) !== null) {
      const matchText = match[0].replace(/[.,;:!?]+$/, '').trim();
      const digitsOnly = matchText.replace(/\D/g, '');

      const hasFormatting = /[+\-().\s]/.test(matchText);
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        continue;
      }
      if (!hasFormatting && digitsOnly.length < 10) {
        continue;
      }

      if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(matchText) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(matchText)) {
        continue;
      }

      // Precision guard: skip if preceded by reference / invoice / code prefix (e.g. "INV-2026-88129", "HOSP-REG-2026-99182")
      const precedingPrefix = text.slice(Math.max(0, match.index - 35), match.index);
      if (/(?:inv|ref|hosp|reg|case|ord|batch|code|ticket|sku|device|mod|serial|sn)[-_:\s#]+$/i.test(precedingPrefix.trimEnd())) {
        continue;
      }
      if (/(?:invoice|billing|registration|hospital|order|case|matter|ticket|product|model|batch|tracking|sku)\s*(?:number|reference|ref|id|code|#)?\s*[:=-]\s*(?:[A-Z0-9_-]+[-_])?$/i.test(precedingPrefix)) {
        continue;
      }

      const relativeStart = match.index;
      const relativeEnd = relativeStart + matchText.length;

      const absoluteStart = blockStartOffset + relativeStart;
      const absoluteEnd = blockStartOffset + relativeEnd;

      const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

      results.push({
        type: PIIType.PHONE_NUMBER,
        category: metadata.category,
        text: matchText,
        normalizedValue: `+${digitsOnly}`,
        confidence: 0.9,
        recognitionConfidence: recConf,
        detectionScore: 0.9,
        severity: metadata.defaultSeverity,
        sensitivityScore: metadata.defaultSensitivityScore,
        evidence: ['PATTERN_MATCH', 'E164_FORMAT_VALID'],
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
