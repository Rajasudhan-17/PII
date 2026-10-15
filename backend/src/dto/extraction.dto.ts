import { INormalizedDocument } from '../models/normalizedDocument.model';

export interface ExtractionStatusDTO {
  documentId: string;
  organizationId: string;
  documentStatus: string;
  extractionStatus: string;
  format: string;
  schemaVersion: string;
  extractorVersion: string;
  pageCount: number;
  blockCount: number;
  tableCount: number;
  warnings: Array<{ code: string; message: string; elementRef?: string }>;
  extractedAt: string | null;
}

export interface NormalizedDocumentResponseDTO {
  id: string;
  documentId: string;
  organizationId: string;
  checksum: string;
  format: string;
  schemaVersion: string;
  extractorVersion: string;
  status: string;
  pages: Array<{
    pageNumber: number;
    width?: number;
    height?: number;
    blockCount: number;
  }>;
  blocks: Array<{
    blockId: string;
    type: string;
    text: string;
    pageNumber?: number;
    containerName?: string;
    readingOrderIndex: number;
    startOffset: number;
    endOffset: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
    provenance: {
      documentId: string;
      organizationId: string;
      pageNumber?: number;
      containerName?: string;
      blockId: string;
      sourceRef?: string;
      xpath?: string;
      cellRef?: string;
    };
  }>;
  tables: Array<{
    tableId: string;
    pageNumber?: number;
    containerName?: string;
    rowCount: number;
    columnCount: number;
    rows: Array<{
      rowIndex: number;
      cells: Array<{
        rowIndex: number;
        columnIndex: number;
        text: string;
        cellRef?: string;
        isHeader?: boolean;
      }>;
    }>;
  }>;
  metadata: Record<string, unknown>;
  warnings: Array<{ code: string; message: string; elementRef?: string }>;
  extractedAt: string;
}

export const toNormalizedDocumentDTO = (norm: INormalizedDocument): NormalizedDocumentResponseDTO => {
  return {
    id: norm._id.toString(),
    documentId: norm.documentId.toString(),
    organizationId: norm.organizationId.toString(),
    checksum: norm.checksum,
    format: norm.format,
    schemaVersion: norm.schemaVersion,
    extractorVersion: norm.extractorVersion,
    status: norm.status,
    pages: norm.pages.map((p) => ({
      pageNumber: p.pageNumber,
      width: p.width,
      height: p.height,
      blockCount: p.blockCount,
    })),
    blocks: norm.blocks.map((b) => ({
      blockId: b.blockId,
      type: b.type,
      text: b.text,
      pageNumber: b.pageNumber,
      containerName: b.containerName,
      readingOrderIndex: b.readingOrderIndex,
      startOffset: b.startOffset,
      endOffset: b.endOffset,
      boundingBox: b.boundingBox,
      provenance: {
        documentId: b.provenance.documentId,
        organizationId: b.provenance.organizationId,
        pageNumber: b.provenance.pageNumber,
        containerName: b.provenance.containerName,
        blockId: b.provenance.blockId,
        sourceRef: b.provenance.sourceRef,
        xpath: b.provenance.xpath,
        cellRef: b.provenance.cellRef,
      },
    })),
    tables: norm.tables.map((t) => ({
      tableId: t.tableId,
      pageNumber: t.pageNumber,
      containerName: t.containerName,
      rowCount: t.rowCount,
      columnCount: t.columnCount,
      rows: t.rows.map((r) => ({
        rowIndex: r.rowIndex,
        cells: r.cells.map((c) => ({
          rowIndex: c.rowIndex,
          columnIndex: c.columnIndex,
          text: c.text,
          cellRef: c.cellRef,
          isHeader: c.isHeader,
        })),
      })),
    })),
    metadata: norm.metadata || {},
    warnings: norm.warnings || [],
    extractedAt: norm.extractedAt ? norm.extractedAt.toISOString() : new Date().toISOString(),
  };
};
