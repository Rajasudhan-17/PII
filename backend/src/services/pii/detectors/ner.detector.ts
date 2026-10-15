import { IPIIDetector, RawDetectedCandidate, DetectionContext } from './detector.interface';
import { PIIType, getPIIMetadata } from '../../../config/piiTaxonomy';
import { INERProvider } from '../ner/ner.interface';
import { HeuristicNERProvider } from '../ner/heuristicNER.provider';
import { calculateCandidateBoundingBox } from '../utils/boundingBox.utils';

export class NERDetector implements IPIIDetector {
  public name = 'NERDetector';
  public version = '1.0.0';
  public type = 'HEURISTIC' as const;
  public supportedTypes = [
    PIIType.PERSON_NAME,
    PIIType.POSTAL_ADDRESS,
    PIIType.CITY,
    PIIType.DATE_OF_BIRTH,
    PIIType.UNKNOWN_PII,
  ];

  private provider: INERProvider;

  constructor(provider?: INERProvider) {
    this.provider = provider || new HeuristicNERProvider();
  }

  public setProvider(provider: INERProvider): void {
    this.provider = provider;
  }

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

    const entities = await this.provider.extractEntities(text);

    for (const entity of entities) {
      const metadata = getPIIMetadata(entity.type);
      const relativeStart = entity.startOffset;
      const relativeEnd = entity.endOffset;

      const absoluteStart = blockStartOffset + relativeStart;
      const absoluteEnd = blockStartOffset + relativeEnd;

      const bbox = calculateCandidateBoundingBox(block, relativeStart, relativeEnd);

      results.push({
        type: entity.type,
        category: metadata.category,
        text: entity.text,
        normalizedValue: entity.text.trim(),
        confidence: entity.confidence,
        recognitionConfidence: recConf,
        detectionScore: entity.confidence,
        severity: metadata.defaultSeverity,
        sensitivityScore: metadata.defaultSensitivityScore,
        evidence: ['HEURISTIC_PATTERN_MATCH'],
        detectorName: `${this.name}:${this.provider.name}`,
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
