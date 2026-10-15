import { PIICategory, PIIType, PIISeverity } from '../../../config/piiTaxonomy';
import { BoundingBox, INormalizedBlock } from '../../../models/normalizedDocument.model';
import { DetectorType, PIISourceType } from '../../../models/piiCandidate.model';

export interface RawDetectedCandidate {
  type: PIIType;
  category: PIICategory;
  text: string;
  normalizedValue: string;
  confidence: number; // Backward compatibility (= detectionScore)
  recognitionConfidence: number | null; // OCR/HTR confidence
  detectionScore: number; // Match confidence (0-1)
  severity: PIISeverity;
  sensitivityScore: number;
  evidence: string[]; // e.g. ['PATTERN_MATCH', 'CHECKSUM_VALID']
  detectorName: string;
  detectorType: DetectorType;
  startOffset: number;
  endOffset: number;
  pageNumber?: number;
  blockId?: string;
  boundingBox?: BoundingBox | null;
  sourceType: PIISourceType;
}

export interface DetectionContext {
  documentId: string;
  organizationId: string;
  block?: INormalizedBlock;
  fullText?: string;
}

export interface IPIIDetector {
  name: string;
  version: string;
  type: DetectorType;
  supportedTypes: PIIType[];
  detect(text: string, context: DetectionContext): Promise<RawDetectedCandidate[]>;
}
