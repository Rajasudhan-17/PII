import AdmZip from 'adm-zip';
import { IDocumentExtractor, ExtractionResult } from './base.extractor';
import { IDocument } from '../../models/document.model';
import {
  INormalizedBlock,
  INormalizedPage,
  INormalizedTable,
  TableRow,
  TableCell,
  ExtractionWarning,
} from '../../models/normalizedDocument.model';
import { validateArchiveBounds } from '../../utils/fileValidation';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

export class DocxExtractor implements IDocumentExtractor {
  public async extract(document: IDocument, filePath: string): Promise<ExtractionResult> {
    const warnings: ExtractionWarning[] = [];

    let zip: AdmZip;
    try {
      zip = new AdmZip(filePath);
    } catch (err) {
      logger.warn({ documentId: document._id.toString(), error: (err as Error).message }, 'Malformed DOCX zip');
      return {
        format: 'DOCX',
        schemaVersion: '1.0.0',
        extractorVersion: '1.0.0',
        status: 'FAILED',
        pages: [],
        blocks: [],
        tables: [],
        metadata: {},
        warnings: [{ code: 'CORRUPT_STRUCTURE', message: 'Failed to open DOCX archive: invalid or corrupt zip file.' }],
      };
    }

    const zipEntries = zip.getEntries();
    let totalSize = 0;
    for (const entry of zipEntries) {
      const name = entry.entryName;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawName = (entry as any).rawEntryName ? (entry as any).rawEntryName.toString('utf8') : '';
      if (name.includes('..') || rawName.includes('..') || name.startsWith('/') || name.startsWith('\\')) {
        throw new AppError(
          'Path traversal attempt detected in DOCX zip entry.',
          400,
          'ZIP_PATH_TRAVERSAL'
        );
      }
      totalSize += entry.header.size;
    }

    validateArchiveBounds(zipEntries.length, totalSize);

    const docEntry = zip.getEntry('word/document.xml');
    if (!docEntry) {
      return {
        format: 'DOCX',
        schemaVersion: '1.0.0',
        extractorVersion: '1.0.0',
        status: 'FAILED',
        pages: [],
        blocks: [],
        tables: [],
        metadata: {},
        warnings: [{ code: 'CORRUPT_STRUCTURE', message: 'Missing word/document.xml in DOCX archive.' }],
      };
    }

    const documentXml = docEntry.getData().toString('utf8');

    const blocks: INormalizedBlock[] = [];
    const tables: INormalizedTable[] = [];

    let globalOffset = 0;
    let blockIndex = 0;
    let tableIndex = 0;

    // 1. Extract Headers & Footers
    for (const entry of zipEntries) {
      if (entry.entryName.startsWith('word/header') || entry.entryName.startsWith('word/footer')) {
        const isHeader = entry.entryName.includes('header');
        const xml = entry.getData().toString('utf8');
        const texts = this.extractTextsFromXml(xml);
        if (texts.length > 0) {
          const joinedText = texts.join(' ');
          blockIndex++;
          const blockId = `docx_${isHeader ? 'hdr' : 'ftr'}_${blockIndex}`;
          const startOffset = globalOffset;
          const endOffset = startOffset + joinedText.length;
          globalOffset = endOffset + 1;

          blocks.push({
            blockId,
            type: isHeader ? 'HEADER' : 'FOOTER',
            text: joinedText,
            containerName: entry.entryName,
            readingOrderIndex: blockIndex,
            startOffset,
            endOffset,
            provenance: {
              documentId: document._id.toString(),
              organizationId: document.organizationId.toString(),
              containerName: entry.entryName,
              blockId,
              sourceRef: entry.entryName,
            },
          });
        }
      }
    }

    // 2. Extract Body Paragraphs & Tables from word/document.xml
    // Regex matching paragraphs (<w:p ...</w:p>) and tables (<w:tbl ...</w:tbl>)
    const elementRegex = /<w:(p|tbl)[\s\S]*?<\/w:\1>/g;
    let match: RegExpExecArray | null;

    while ((match = elementRegex.exec(documentXml)) !== null) {
      const tagType = match[1];
      const xmlChunk = match[0];

      if (tagType === 'p') {
        const text = this.extractTextsFromXml(xmlChunk).join('').trim();
        if (text.length > 0) {
          blockIndex++;
          const blockId = `docx_b_${blockIndex}`;
          const startOffset = globalOffset;
          const endOffset = startOffset + text.length;
          globalOffset = endOffset + 1;

          const isHeading = /<w:pStyle\s+w:val="Heading/i.test(xmlChunk);

          blocks.push({
            blockId,
            type: isHeading ? 'HEADING' : 'PARAGRAPH',
            text,
            containerName: 'word/document.xml',
            readingOrderIndex: blockIndex,
            startOffset,
            endOffset,
            provenance: {
              documentId: document._id.toString(),
              organizationId: document.organizationId.toString(),
              containerName: 'word/document.xml',
              blockId,
              xpath: `/w:document/w:body/w:p[${blockIndex}]`,
            },
          });
        }
      } else if (tagType === 'tbl') {
        tableIndex++;
        const tableId = `docx_tbl_${tableIndex}`;
        const rows: TableRow[] = [];
        const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
        let rowMatch: RegExpExecArray | null;
        let rIdx = 0;
        let maxCols = 0;

        while ((rowMatch = rowRegex.exec(xmlChunk)) !== null) {
          rIdx++;
          const cellRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
          let cellMatch: RegExpExecArray | null;
          const cells: TableCell[] = [];
          let cIdx = 0;

          while ((cellMatch = cellRegex.exec(rowMatch[0])) !== null) {
            cIdx++;
            const cellText = this.extractTextsFromXml(cellMatch[0]).join('').trim();
            cells.push({
              rowIndex: rIdx,
              columnIndex: cIdx,
              text: cellText,
              cellRef: `R${rIdx}C${cIdx}`,
              isHeader: rIdx === 1,
            });
          }
          if (cIdx > maxCols) maxCols = cIdx;
          rows.push({ rowIndex: rIdx, cells });
        }

        if (rows.length > 0) {
          blockIndex++;
          const blockId = `docx_b_${blockIndex}`;
          const tableSummaryText = rows
            .map((r) => r.cells.map((c) => c.text).join(' | '))
            .join('\n');

          const startOffset = globalOffset;
          const endOffset = startOffset + tableSummaryText.length;
          globalOffset = endOffset + 1;

          tables.push({
            tableId,
            containerName: 'word/document.xml',
            rowCount: rows.length,
            columnCount: maxCols,
            rows,
            provenance: {
              documentId: document._id.toString(),
              organizationId: document.organizationId.toString(),
              containerName: 'word/document.xml',
              blockId: tableId,
            },
          });

          blocks.push({
            blockId,
            type: 'TABLE',
            text: tableSummaryText,
            containerName: 'word/document.xml',
            readingOrderIndex: blockIndex,
            startOffset,
            endOffset,
            provenance: {
              documentId: document._id.toString(),
              organizationId: document.organizationId.toString(),
              containerName: 'word/document.xml',
              blockId,
              xpath: `/w:document/w:body/w:tbl[${tableIndex}]`,
            },
          });
        }
      }
    }

    const pages: INormalizedPage[] = [{ pageNumber: 1, blockCount: blocks.length }];

    return {
      format: 'DOCX',
      schemaVersion: '1.0.0',
      extractorVersion: '1.0.0',
      status: 'COMPLETE',
      pages,
      blocks,
      tables,
      metadata: { blockCount: blocks.length, tableCount: tables.length },
      warnings,
    };
  }

  private extractTextsFromXml(xml: string): string[] {
    const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = textRegex.exec(xml)) !== null) {
      results.push(match[1]);
    }
    return results;
  }
}
