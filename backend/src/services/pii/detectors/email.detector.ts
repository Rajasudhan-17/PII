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

  // Obfuscated email representations: name [at] domain [dot] com, name (at) domain (dot) com, name at domain dot com
  private OBFUSCATED_EMAIL_REGEX =
    /\b[a-zA-Z0-9._%+-]+(?:\s*(?:\[at\]|\(at\))\s*|\s+at\s+)[a-zA-Z0-9.-]+(?:\s*(?:\[dot\]|\(dot\))\s*|\s+dot\s+)[a-zA-Z]{2,}\b/gi;

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

    const evaluateCandidate = (
      rawText: string,
      relativeStart: number,
      normalizedEmail: string
    ) => {
      const matchText = rawText.replace(/[.,;:!?)]+$/, '');
      const relativeEnd = relativeStart + matchText.length;

      // Policy & Context-based treatment for non-personal organizational endpoints:
      // Generic functional mailboxes (helpdesk, support, inquiries, etc.) operating as public channels
      // are excluded unless explicitly bound to personal context (e.g. Employee Email, Patient Email)
      const isGenericRoleMailbox =
        /^(?:support|sales|info|contact|help|helpdesk|billing|marketing|careers|press|inquiries|service|no-reply|noreply|notifications)@/i.test(
          normalizedEmail
        );

      const precedingContext = text.slice(Math.max(0, relativeStart - 45), relativeStart);
      const hasCorporateChannelContext =
        /(?:official\s+support(?:\s+channel)?|inquiries\s+desk|support\s+channel|customer\s+service|help\s+desk|general\s+inquiries|public\s+channel)[:\s]+$/i.test(
          precedingContext
        );
      const hasPersonalContext =
        /(?:applicant|patient|employee|candidate|client|signatory|witness|resident|user|account)\s*(?:e-?mail|contact)?[:\s]+$/i.test(
          precedingContext
        );

      if (isGenericRoleMailbox && (hasCorporateChannelContext || !hasPersonalContext)) {
        return;
      }

      const absoluteStart = blockStartOffset + relativeStart;
      const absoluteEnd = blockStartOffset + relativeEnd;
      const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

      results.push({
        type: PIIType.EMAIL_ADDRESS,
        category: metadata.category,
        text: matchText,
        normalizedValue: normalizedEmail,
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
    };

    // 1. Standard emails
    let match: RegExpExecArray | null;
    this.EMAIL_REGEX.lastIndex = 0;
    while ((match = this.EMAIL_REGEX.exec(text)) !== null) {
      evaluateCandidate(match[0], match.index, match[0].toLowerCase());
    }

    // 2. Obfuscated emails
    this.OBFUSCATED_EMAIL_REGEX.lastIndex = 0;
    while ((match = this.OBFUSCATED_EMAIL_REGEX.exec(text)) !== null) {
      const rawText = match[0];
      const start = match.index;
      const end = start + rawText.length;

      // Avoid double-emitting if already covered by standard email
      const alreadyCaptured = results.some(
        (r) => (r.startOffset - blockStartOffset) < end && (r.endOffset - blockStartOffset) > start
      );
      if (alreadyCaptured) {
        continue;
      }

      const normalized = rawText
        .replace(/\s*(?:\[at\]|\(at\)|\bat\b)\s*/gi, '@')
        .replace(/\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*/gi, '.')
        .toLowerCase();

      evaluateCandidate(rawText, start, normalized);
    }

    return results;
  }
}
