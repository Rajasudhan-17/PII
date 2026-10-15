import {
  ExtractionStatus,
  INormalizedBlock,
  INormalizedPage,
  INormalizedTable,
  ExtractionWarning,
} from '../../models/normalizedDocument.model';
import { IDocument } from '../../models/document.model';

export interface ExtractionResult {
  format: string;
  schemaVersion: string;
  extractorVersion: string;
  status: ExtractionStatus;
  pages: INormalizedPage[];
  blocks: INormalizedBlock[];
  tables: INormalizedTable[];
  metadata: Record<string, unknown>;
  warnings: ExtractionWarning[];
}

export interface IDocumentExtractor {
  extract(document: IDocument, filePath: string): Promise<ExtractionResult>;
}
