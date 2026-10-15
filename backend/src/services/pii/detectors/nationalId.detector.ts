import { IPIIDetector, RawDetectedCandidate, DetectionContext } from './detector.interface';
import { PIIType, getPIIMetadata } from '../../../config/piiTaxonomy';
import { calculateCandidateBoundingBox } from '../utils/boundingBox.utils';

const verhoeffD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 1, 2, 3, 4],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const verhoeffP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 4, 9, 0],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidVerhoeff(str: string): boolean {
  if (!/^\d+$/.test(str)) return false;
  let c = 0;
  const myArray = str.split('').map(Number).reverse();
  for (let i = 0; i < myArray.length; i++) {
    c = verhoeffD[c][verhoeffP[i % 8][myArray[i]]];
  }
  return c === 0;
}

export function isValidUSSSN(ssn: string): boolean {
  const digits = ssn.replace(/\D/g, '');
  if (digits.length !== 9) return false;

  const area = parseInt(digits.substring(0, 3), 10);
  const group = parseInt(digits.substring(3, 5), 10);
  const serial = parseInt(digits.substring(5, 9), 10);

  if (area === 0 || area === 666 || (area >= 900 && area <= 999)) return false;
  if (group === 0) return false;
  if (serial === 0) return false;

  return true;
}

export class NationalIDDetector implements IPIIDetector {
  public name = 'NationalIDDetector';
  public version = '1.0.0';
  public type = 'DETERMINISTIC' as const;
  public supportedTypes = [
    PIIType.US_SSN,
    PIIType.INDIAN_PAN,
    PIIType.INDIAN_AADHAAR,
  ];

  private SSN_REGEX = /\b(?:\d{3}-\d{2}-\d{4}|\d{9})\b/g;
  private PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g;
  private AADHAAR_REGEX = /\b[2-9]\d{3}[-\s]?\d{4}[-\s]?\d{4}\b/g;

  public async detect(
    text: string,
    context: DetectionContext
  ): Promise<RawDetectedCandidate[]> {
    const results: RawDetectedCandidate[] = [];
    if (!text) return results;

    const block = context.block;
    const blockStartOffset = block ? block.startOffset : 0;
    const sourceType = block?.recognitionMethod || 'NATIVE_TEXT';
    const recConf = typeof block?.confidence === 'number' ? block.confidence : null;

    // 1. US SSN
    this.SSN_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    const ssnMeta = getPIIMetadata(PIIType.US_SSN);

    while ((match = this.SSN_REGEX.exec(text)) !== null) {
      const matchText = match[0];
      if (!isValidUSSSN(matchText)) continue;

      const relativeStart = match.index;
      const relativeEnd = relativeStart + matchText.length;
      const absoluteStart = blockStartOffset + relativeStart;
      const absoluteEnd = blockStartOffset + relativeEnd;
      const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

      results.push({
        type: PIIType.US_SSN,
        category: ssnMeta.category,
        text: matchText,
        normalizedValue: matchText.replace(/\D/g, ''),
        confidence: 0.95,
        recognitionConfidence: recConf,
        detectionScore: 0.95,
        severity: ssnMeta.defaultSeverity,
        sensitivityScore: ssnMeta.defaultSensitivityScore,
        evidence: ['PATTERN_MATCH', 'FORMAT_RULES_VALID'],
        detectorName: `${this.name}:US_SSN`,
        detectorType: this.type,
        startOffset: absoluteStart,
        endOffset: absoluteEnd,
        pageNumber: block?.pageNumber,
        blockId: block?.blockId || 'FULL_TEXT',
        boundingBox: bbox || null,
        sourceType,
      });
    }

    // 2. Indian PAN
    this.PAN_REGEX.lastIndex = 0;
    const panMeta = getPIIMetadata(PIIType.INDIAN_PAN);

    while ((match = this.PAN_REGEX.exec(text)) !== null) {
      const matchText = match[0];
      const relativeStart = match.index;
      const relativeEnd = relativeStart + matchText.length;
      const absoluteStart = blockStartOffset + relativeStart;
      const absoluteEnd = blockStartOffset + relativeEnd;
      const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

      results.push({
        type: PIIType.INDIAN_PAN,
        category: panMeta.category,
        text: matchText,
        normalizedValue: matchText.toUpperCase(),
        confidence: 0.98,
        recognitionConfidence: recConf,
        detectionScore: 0.98,
        severity: panMeta.defaultSeverity,
        sensitivityScore: panMeta.defaultSensitivityScore,
        evidence: ['PATTERN_MATCH'],
        detectorName: `${this.name}:INDIAN_PAN`,
        detectorType: this.type,
        startOffset: absoluteStart,
        endOffset: absoluteEnd,
        pageNumber: block?.pageNumber,
        blockId: block?.blockId || 'FULL_TEXT',
        boundingBox: bbox || null,
        sourceType,
      });
    }

    // 3. Indian Aadhaar with Verhoeff D5 Checksum
    this.AADHAAR_REGEX.lastIndex = 0;
    const aadhaarMeta = getPIIMetadata(PIIType.INDIAN_AADHAAR);

    while ((match = this.AADHAAR_REGEX.exec(text)) !== null) {
      const matchText = match[0];
      const digitsOnly = matchText.replace(/\D/g, '');

      if (digitsOnly.length !== 12 || !isValidVerhoeff(digitsOnly)) {
        continue;
      }

      const relativeStart = match.index;
      const relativeEnd = relativeStart + matchText.length;
      const absoluteStart = blockStartOffset + relativeStart;
      const absoluteEnd = blockStartOffset + relativeEnd;
      const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

      results.push({
        type: PIIType.INDIAN_AADHAAR,
        category: aadhaarMeta.category,
        text: matchText,
        normalizedValue: digitsOnly,
        confidence: 0.99,
        recognitionConfidence: recConf,
        detectionScore: 0.99,
        severity: aadhaarMeta.defaultSeverity,
        sensitivityScore: aadhaarMeta.defaultSensitivityScore,
        evidence: ['PATTERN_MATCH', 'VERHOEFF_CHECKSUM_VALID'],
        detectorName: `${this.name}:INDIAN_AADHAAR`,
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
