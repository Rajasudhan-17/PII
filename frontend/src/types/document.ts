export type DocumentStatus =
  | 'QUARANTINED'
  | 'VALIDATING'
  | 'READY'
  | 'EXTRACTION_QUEUED'
  | 'EXTRACTING'
  | 'EXTRACTED'
  | 'EXTRACTION_PARTIAL'
  | 'EXTRACTION_FAILED'
  | 'OCR_REQUIRED'
  | 'OCR_QUEUED'
  | 'OCR_PROCESSING'
  | 'OCR_COMPLETED'
  | 'OCR_FAILED'
  | 'ENCRYPTED'
  | 'REJECTED'
  | 'DELETED'
  // Backward compatibility aliases
  | 'UPLOADED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export interface DocumentItem {
  id: string;
  organizationId: string;
  uploadedBy: string;
  originalFilename: string;
  size: number;
  declaredMimeType: string;
  detectedMimeType: string;
  extension: string;
  status: DocumentStatus;
  checksum: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  count?: number;
  documents: DocumentItem[];
  total?: number;
}

export interface ExtractionStatusResult {
  documentId: string;
  organizationId: string;
  documentStatus: DocumentStatus;
  extractionStatus: 'COMPLETE' | 'PARTIAL' | 'OCR_REQUIRED' | 'ENCRYPTED' | 'FAILED' | 'NOT_EXTRACTED';
  format: string;
  schemaVersion: string;
  extractorVersion: string;
  pageCount: number;
  blockCount: number;
  tableCount: number;
  warnings: string[];
  extractedAt?: string | null;
}

export interface OCRStatusResult {
  documentId: string;
  organizationId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  pageCount?: number;
  blockCount?: number;
  averageConfidence?: number;
  engine?: string;
  warnings?: string[];
}

export interface PIISummaryResult {
  documentId: string;
  organizationId: string;
  totalCandidates: number;
  categories: Record<string, number>;
  highestConfidence: number;
  detectionRunId?: string;
}

export interface NormalizedDocumentBlock {
  blockId: string;
  type: string;
  text: string;
  pageNumber?: number;
  containerName?: string;
  readingOrderIndex?: number;
  startOffset: number;
  endOffset: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface NormalizedDocument {
  id: string;
  documentId: string;
  organizationId: string;
  checksum: string;
  format: string;
  schemaVersion?: string;
  extractorVersion?: string;
  status?: string;
  pages?: Array<{
    pageNumber: number;
    width?: number;
    height?: number;
    blockCount: number;
  }>;
  blocks: NormalizedDocumentBlock[];
}

export interface NormalizedDocumentResponse {
  normalizedDocument: NormalizedDocument;
}

export type DocumentSortField = 'createdAt' | 'originalFilename' | 'size' | 'status';
export type SortDirection = 'asc' | 'desc';

