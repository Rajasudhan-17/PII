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
      const matchIndex = match.index;
      const rawMatch = match[0];

      // 1. Boundary check: must not be embedded inside alphanumeric tokens (e.g. 1Z999AA10123456784, DL21)
      if (matchIndex > 0 && /[a-zA-Z0-9]/.test(text[matchIndex - 1])) {
        continue;
      }
      if (matchIndex + rawMatch.length < text.length && /[a-zA-Z0-9]/.test(text[matchIndex + rawMatch.length])) {
        continue;
      }

      const matchText = rawMatch.replace(/[.,;:!?]+$/, '').trim();
      const digitsOnly = matchText.replace(/\D/g, '');

      const hasFormatting = /[+\-().\s]/.test(matchText);
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        continue;
      }
      if (!hasFormatting && digitsOnly.length < 10) {
        continue;
      }

      // 2. Reject dates (e.g. 2026-09-15, 15/09/2026)
      if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(matchText) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(matchText)) {
        continue;
      }

      // 3. Reject IPv4 addresses (e.g. 192.168.1.105)
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(matchText)) {
        continue;
      }

      // 4. Reject SSN format (3 digits - 2 digits - 4 digits)
      if (/^\d{3}[-.\s]\d{2}[-.\s]\d{4}$/.test(matchText)) {
        continue;
      }

      // 5. Reject 12-digit Aadhaar / Card structures (4-4-4)
      if (/^\d{4}[-.\s]\d{4}[-.\s]\d{4}$/.test(matchText)) {
        continue;
      }

      // 6. Reject slices of 16-digit credit cards or IBANs
      const afterMatch = text.slice(matchIndex + rawMatch.length, matchIndex + rawMatch.length + 8);
      if (/^\s+\d{4}\b/.test(afterMatch) && (digitsOnly.length === 8 || digitsOnly.length === 12)) {
        continue;
      }
      const beforeMatch = text.slice(Math.max(0, matchIndex - 8), matchIndex);
      if (/\b\d{4}\s+$/.test(beforeMatch) && (digitsOnly.length === 8 || digitsOnly.length === 12)) {
        continue;
      }

      // 7. Context guard: skip if preceded by tracking, AWB, shipment, invoice, equipment, serial, IP, card contexts
      const precedingPrefix = text.slice(Math.max(0, matchIndex - 50), matchIndex);
      if (/(?:inv|ref|hosp|reg|case|ord|batch|code|ticket|sku|device|mod|serial|sn|awb|dl|badge)[-_:\s#]+$/i.test(precedingPrefix.trimEnd())) {
        continue;
      }
      if (/(?:tracking|awb|airway\s+bill|consignment|shipment|waybill|courier|freight|package|parcel|invoice|billing|registration|hospital|order|case|matter|ticket|product|model|batch|sku|device|serial|equipment|badge|licence|license|dl|passport|iban|card|pan|aadhaar|ssn|ip\s+address)\s*(?:number|no|num|#|id|ref|code)?\s*[:=-]?\s*(?:[A-Z0-9_-]+[-_\s]+)*$/i.test(precedingPrefix)) {
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
