import fs from 'fs';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
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

export class XlsxExtractor implements IDocumentExtractor {
  public async extract(document: IDocument, filePath: string): Promise<ExtractionResult> {
    const warnings: ExtractionWarning[] = [];

    // Verify binary magic header (PK\x03\x04 for ZIP-based OOXML .xlsx files)
    try {
      const buf = await fs.promises.readFile(filePath);
      if (buf.length < 4 || !buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
        return {
          format: 'XLSX',
          schemaVersion: '1.0.0',
          extractorVersion: '1.0.0',
          status: 'FAILED',
          pages: [],
          blocks: [],
          tables: [],
          metadata: {},
          warnings: [{ code: 'CORRUPT_STRUCTURE', message: 'Invalid or corrupt XLSX file structure (missing PK header).' }],
        };
      }
    } catch {
      // ignore
    }

    // Decompression bomb & path traversal safety validation
    let zip: AdmZip;
    try {
      zip = new AdmZip(filePath);
    } catch (err) {
      logger.warn({ documentId: document._id.toString(), error: (err as Error).message }, 'Malformed XLSX zip');
      return {
        format: 'XLSX',
        schemaVersion: '1.0.0',
        extractorVersion: '1.0.0',
        status: 'FAILED',
        pages: [],
        blocks: [],
        tables: [],
        metadata: {},
        warnings: [{ code: 'CORRUPT_STRUCTURE', message: 'Failed to open XLSX archive: invalid or corrupt zip file.' }],
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
          'Path traversal attempt detected in XLSX zip entry.',
          400,
          'ZIP_PATH_TRAVERSAL'
        );
      }
      totalSize += entry.header.size;
    }

    validateArchiveBounds(zipEntries.length, totalSize);

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.readFile(filePath, { cellFormula: true, cellHTML: false });
    } catch (err) {
      logger.warn({ documentId: document._id.toString(), error: (err as Error).message }, 'Failed to read XLSX');
      return {
        format: 'XLSX',
        schemaVersion: '1.0.0',
        extractorVersion: '1.0.0',
        status: 'FAILED',
        pages: [],
        blocks: [],
        tables: [],
        metadata: {},
        warnings: [{ code: 'CORRUPT_STRUCTURE', message: 'Failed to parse XLSX workbook structure.' }],
      };
    }

    const sheetNames = workbook.SheetNames || [];
    const blocks: INormalizedBlock[] = [];
    const tables: INormalizedTable[] = [];
    const pages: INormalizedPage[] = [];

    let globalOffset = 0;
    let blockIndex = 0;

    // Check hidden sheets
    const hiddenSheets: string[] = [];
    if (workbook.Workbook && workbook.Workbook.Sheets) {
      workbook.Workbook.Sheets.forEach((sheetMeta, index) => {
        if (sheetMeta.Hidden && sheetMeta.Hidden > 0) {
          const sName = sheetNames[index] || `Sheet${index + 1}`;
          hiddenSheets.push(sName);
        }
      });
    }

    if (hiddenSheets.length > 0) {
      warnings.push({
        code: 'HIDDEN_SHEET_PRESENT',
        message: `Hidden worksheets detected in workbook: ${hiddenSheets.join(', ')}. Content extracted.`,
      });
    }

    for (let sIdx = 0; sIdx < sheetNames.length; sIdx++) {
      const sheetName = sheetNames[sIdx];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
      const rowCount = range.e.r - range.s.r + 1;
      const colCount = range.e.c - range.s.c + 1;

      const rows: TableRow[] = [];
      let pageBlockCount = 0;

      for (let R = range.s.r; R <= range.e.r; ++R) {
        const cells: TableCell[] = [];
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = sheet[cellAddress];
          const textVal = cell && cell.v !== undefined ? String(cell.v).trim() : '';

          if (textVal || cell?.f) {
            cells.push({
              rowIndex: R + 1,
              columnIndex: C + 1,
              text: textVal,
              cellRef: cellAddress,
              isHeader: R === range.s.r,
            });
          }
        }

        if (cells.length > 0) {
          rows.push({
            rowIndex: R + 1,
            cells,
          });
        }
      }

      if (rows.length > 0) {
        const tableId = `xlsx_tbl_${sIdx + 1}`;
        const tableText = rows
          .map((r) => r.cells.map((c) => `${c.cellRef}: ${c.text}`).join(' | '))
          .join('\n');

        blockIndex++;
        pageBlockCount++;
        const blockId = `xlsx_b_${blockIndex}`;
        const startOffset = globalOffset;
        const endOffset = startOffset + tableText.length;
        globalOffset = endOffset + 1;

        tables.push({
          tableId,
          containerName: sheetName,
          rowCount,
          columnCount: colCount,
          rows,
          provenance: {
            documentId: document._id.toString(),
            organizationId: document.organizationId.toString(),
            containerName: sheetName,
            blockId: tableId,
          },
        });

        blocks.push({
          blockId,
          type: 'TABLE',
          text: tableText,
          containerName: sheetName,
          readingOrderIndex: blockIndex,
          startOffset,
          endOffset,
          provenance: {
            documentId: document._id.toString(),
            organizationId: document.organizationId.toString(),
            containerName: sheetName,
            blockId,
            cellRef: `${sheetName}!A1`,
          },
        });
      }

      pages.push({
        pageNumber: sIdx + 1,
        blockCount: pageBlockCount,
      });
    }

    return {
      format: 'XLSX',
      schemaVersion: '1.0.0',
      extractorVersion: '1.0.0',
      status: 'COMPLETE',
      pages,
      blocks,
      tables,
      metadata: {
        sheetNames,
        hiddenSheets,
        sheetCount: sheetNames.length,
      },
      warnings,
    };
  }
}
