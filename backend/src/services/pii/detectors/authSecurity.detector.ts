import { IPIIDetector, RawDetectedCandidate, DetectionContext } from './detector.interface';
import { PIIType, getPIIMetadata } from '../../../config/piiTaxonomy';
import { calculateCandidateBoundingBox } from '../utils/boundingBox.utils';

export class AuthSecurityDetector implements IPIIDetector {
  public name = 'AuthSecurityDetector';
  public version = '1.0.0';
  public type = 'DETERMINISTIC' as const;
  public supportedTypes = [PIIType.AUTH_TOKEN_KEY];

  private PATTERNS = [
    {
      name: 'JWT Token',
      regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    },
    {
      name: 'AWS Access Key',
      regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    },
    {
      name: 'PEM Private Key',
      regex: /-----BEGIN (?:RSA|EC|DSA|OPENSSH) PRIVATE KEY-----[\s\S]+?-----END (?:RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/g,
    },
    {
      name: 'Generic API Key',
      regex: /\b(?:bearer|token|api[_-]?key|secret|password)\s*[:=]\s*["']?([A-Za-z0-9_.-]{20,64})["']?\b/gi,
    },
  ];

  public async detect(
    text: string,
    context: DetectionContext
  ): Promise<RawDetectedCandidate[]> {
    const results: RawDetectedCandidate[] = [];
    if (!text) return results;

    const metadata = getPIIMetadata(PIIType.AUTH_TOKEN_KEY);
    const block = context.block;
    const blockStartOffset = block ? block.startOffset : 0;
    const sourceType = block?.recognitionMethod || 'NATIVE_TEXT';
    const recConf = typeof block?.confidence === 'number' ? block.confidence : null;

    for (const pattern of this.PATTERNS) {
      let match: RegExpExecArray | null;
      pattern.regex.lastIndex = 0;

      while ((match = pattern.regex.exec(text)) !== null) {
        const matchText = match[0];

        // Skip obvious placeholder examples
        if (/example|placeholder|xxxx|12345/i.test(matchText) && !matchText.startsWith('AKIA')) {
          continue;
        }

        const relativeStart = match.index;
        const relativeEnd = relativeStart + matchText.length;

        const absoluteStart = blockStartOffset + relativeStart;
        const absoluteEnd = blockStartOffset + relativeEnd;

        const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

        results.push({
          type: PIIType.AUTH_TOKEN_KEY,
          category: metadata.category,
          text: matchText,
          normalizedValue: matchText.trim(),
          confidence: 0.99,
          recognitionConfidence: recConf,
          detectionScore: 0.99,
          severity: metadata.defaultSeverity,
          sensitivityScore: metadata.defaultSensitivityScore,
          evidence: ['PROVIDER_KEY_PATTERN', pattern.name.toUpperCase().replace(/\s+/g, '_')],
          detectorName: `${this.name}:${pattern.name}`,
          detectorType: this.type,
          startOffset: absoluteStart,
          endOffset: absoluteEnd,
          pageNumber: block?.pageNumber,
          blockId: block?.blockId || 'FULL_TEXT',
          boundingBox: bbox || null,
          sourceType,
        });
      }
    }

    return results;
  }
}
