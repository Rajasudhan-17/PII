import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type BlockType =
  | 'PARAGRAPH'
  | 'HEADING'
  | 'TABLE'
  | 'LIST'
  | 'HEADER'
  | 'FOOTER'
  | 'FOOTNOTE'
  | 'CAPTION'
  | 'CODE'
  | 'TEXT'
  | 'IMAGE'
  | 'UNKNOWN';

export type ExtractionStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'FAILED'
  | 'OCR_REQUIRED'
  | 'ENCRYPTED'
  | 'OCR_QUEUED'
  | 'OCR_PROCESSING'
  | 'OCR_COMPLETED'
  | 'OCR_PARTIAL'
  | 'OCR_FAILED';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BlockProvenance {
  documentId: string;
  organizationId: string;
  pageNumber?: number;
  containerName?: string;
  blockId: string;
  sourceRef?: string;
  xpath?: string;
  cellRef?: string;
}

export interface INormalizedBlock {
  blockId: string;
  type: BlockType;
  text: string;
  pageNumber?: number;
  containerName?: string;
  readingOrderIndex: number;
  startOffset: number;
  endOffset: number;
  boundingBox?: BoundingBox;
  confidence?: number | null;
  recognitionMethod?: 'NATIVE_TEXT' | 'PRINT_OCR' | 'HANDWRITING_HTR' | 'GENERIC_OCR_FALLBACK';
  words?: Array<{
    text: string;
    confidence?: number | null;
    boundingBox?: BoundingBox;
  }>;
  provenance: BlockProvenance;
}

export interface TableCell {
  rowIndex: number;
  columnIndex: number;
  text: string;
  cellRef?: string;
  isHeader?: boolean;
  boundingBox?: BoundingBox;
}

export interface TableRow {
  rowIndex: number;
  cells: TableCell[];
}

export interface INormalizedTable {
  tableId: string;
  pageNumber?: number;
  containerName?: string;
  rowCount: number;
  columnCount: number;
  rows: TableRow[];
  provenance: BlockProvenance;
}

export interface INormalizedPage {
  pageNumber: number;
  width?: number;
  height?: number;
  blockCount: number;
}

export interface ExtractionWarning {
  code: string;
  message: string;
  elementRef?: string;
}

export interface INormalizedDocument extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  checksum: string;
  format: string;
  schemaVersion: string;
  extractorVersion: string;
  status: ExtractionStatus;
  pages: INormalizedPage[];
  blocks: INormalizedBlock[];
  tables: INormalizedTable[];
  metadata: Record<string, unknown>;
  warnings: ExtractionWarning[];
  extractedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const boundingBoxSchema = new Schema<BoundingBox>(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false }
);

const provenanceSchema = new Schema<BlockProvenance>(
  {
    documentId: { type: String, required: true },
    organizationId: { type: String, required: true },
    pageNumber: { type: Number },
    containerName: { type: String },
    blockId: { type: String, required: true },
    sourceRef: { type: String },
    xpath: { type: String },
    cellRef: { type: String },
  },
  { _id: false }
);

const wordSchema = new Schema(
  {
    text: { type: String, required: true },
    confidence: { type: Schema.Types.Mixed, default: null },
    boundingBox: { type: boundingBoxSchema },
  },
  { _id: false }
);

const blockSchema = new Schema<INormalizedBlock>(
  {
    blockId: { type: String, required: true },
    type: {
      type: String,
      enum: [
        'PARAGRAPH',
        'HEADING',
        'TABLE',
        'LIST',
        'HEADER',
        'FOOTER',
        'FOOTNOTE',
        'CAPTION',
        'CODE',
        'TEXT',
        'IMAGE',
        'UNKNOWN',
      ],
      required: true,
    },
    text: { type: String, required: true, default: '' },
    pageNumber: { type: Number },
    containerName: { type: String },
    readingOrderIndex: { type: Number, required: true },
    startOffset: { type: Number, required: true },
    endOffset: { type: Number, required: true },
    boundingBox: { type: boundingBoxSchema },
    confidence: { type: Schema.Types.Mixed, default: null },
    recognitionMethod: {
      type: String,
      enum: ['NATIVE_TEXT', 'PRINT_OCR', 'HANDWRITING_HTR', 'GENERIC_OCR_FALLBACK'],
    },
    words: [wordSchema],
    provenance: { type: provenanceSchema, required: true },
  },
  { _id: false }
);

const tableCellSchema = new Schema<TableCell>(
  {
    rowIndex: { type: Number, required: true },
    columnIndex: { type: Number, required: true },
    text: { type: String, required: true, default: '' },
    cellRef: { type: String },
    isHeader: { type: Boolean, default: false },
    boundingBox: { type: boundingBoxSchema },
  },
  { _id: false }
);

const tableRowSchema = new Schema<TableRow>(
  {
    rowIndex: { type: Number, required: true },
    cells: [tableCellSchema],
  },
  { _id: false }
);

const normalizedTableSchema = new Schema<INormalizedTable>(
  {
    tableId: { type: String, required: true },
    pageNumber: { type: Number },
    containerName: { type: String },
    rowCount: { type: Number, required: true },
    columnCount: { type: Number, required: true },
    rows: [tableRowSchema],
    provenance: { type: provenanceSchema, required: true },
  },
  { _id: false }
);

const normalizedPageSchema = new Schema<INormalizedPage>(
  {
    pageNumber: { type: Number, required: true },
    width: { type: Number },
    height: { type: Number },
    blockCount: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const warningSchema = new Schema<ExtractionWarning>(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
    elementRef: { type: String },
  },
  { _id: false }
);

const normalizedDocumentSchema = new Schema<INormalizedDocument>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    checksum: {
      type: String,
      required: true,
      index: true,
    },
    format: {
      type: String,
      required: true,
    },
    schemaVersion: {
      type: String,
      required: true,
      default: '1.0.0',
    },
    extractorVersion: {
      type: String,
      required: true,
      default: '1.0.0',
    },
    status: {
      type: String,
      enum: [
        'COMPLETE',
        'PARTIAL',
        'FAILED',
        'OCR_REQUIRED',
        'ENCRYPTED',
        'OCR_QUEUED',
        'OCR_PROCESSING',
        'OCR_COMPLETED',
        'OCR_PARTIAL',
        'OCR_FAILED',
      ],
      required: true,
      index: true,
    },
    pages: [normalizedPageSchema],
    blocks: [blockSchema],
    tables: [normalizedTableSchema],
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    warnings: [warningSchema],
    extractedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for strict tenant-isolated queries and idempotency lookup
normalizedDocumentSchema.index({ organizationId: 1, documentId: 1 }, { unique: true });
normalizedDocumentSchema.index({ documentId: 1, checksum: 1 });

export const NormalizedDocumentModel = mongoose.model<INormalizedDocument>(
  'NormalizedDocument',
  normalizedDocumentSchema
);
