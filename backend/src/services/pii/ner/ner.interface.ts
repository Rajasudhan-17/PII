import { PIIType } from '../../../config/piiTaxonomy';

export interface INEREntity {
  type: PIIType;
  text: string;
  startOffset: number; // Relative start offset in input string
  endOffset: number; // Relative end offset in input string
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface INERProvider {
  name: string;
  supportedTypes: PIIType[];
  extractEntities(text: string): Promise<INEREntity[]>;
}
