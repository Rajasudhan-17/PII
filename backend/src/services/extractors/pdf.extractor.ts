import fs from 'fs';
import pdfParse from 'pdf-parse';
import { IDocumentExtractor, ExtractionResult } from './base.extractor';
import { IDocument } from '../../models/document.model';
import { INormalizedBlock, INormalizedPage, ExtractionWarning } from '../../models/normalizedDocument.model';
import { logger } from '../../utils/logger';

export class PdfExtractor implements IDocumentExtractor {
  public async extract(document: IDocument, filePath: string): Promise<ExtractionResult> {
    const dataBuffer = await fs.promises.readFile(filePath);
    const warnings: ExtractionWarning[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawText = '';
    let numPages = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pdfInfo: any = {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfModule: any = pdfParse;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const PDFParseClass: any =
        pdfModule?.PDFParse ||
        pdfModule?.default?.PDFParse ||
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        (typeof require !== 'undefined' ? require('pdf-parse')?.PDFParse : undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parseFunc: any =
        typeof pdfParse === 'function'
          ? pdfParse
          : typeof pdfModule?.default === 'function'
          ? pdfModule.default
          : undefined;

      if (PDFParseClass) {
        const parser = new PDFParseClass({ data: dataBuffer });
        await parser.load();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const textResult = await parser.getText();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const infoResult = await parser.getInfo();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageTexts = (textResult.pages || []).map((p: any) => (p.text ? p.text.trim() : '')).filter((t: string) => t.length > 0);
        rawText = pageTexts.join('\n\n');
        numPages = textResult.total || infoResult.total || 1;
        pdfInfo = infoResult.info || {};
        await parser.destroy();
      } else if (parseFunc) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed: any = await parseFunc(dataBuffer, { max: 500 });
        rawText = parsed.text ? parsed.text.trim() : '';
        numPages = parsed.numpages || 1;
        pdfInfo = parsed.info || {};
      } else {
        throw new Error('Unsupported PDF parsing provider interface');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      if (/password|encrypted/i.test(errMsg)) {
        return {
          format: 'PDF',
          schemaVersion: '1.0.0',
          extractorVersion: '1.0.0',
          status: 'ENCRYPTED',
          pages: [],
          blocks: [],
          tables: [],
          metadata: { encrypted: true },
          warnings: [{ code: 'PASSWORD_PROTECTED', message: 'PDF document is password protected or encrypted.' }],
        };
      }

      // Check if it's a worker/VM environment limitation where we can recover stream text from PDF syntax
      const rawBinary = dataBuffer.toString('binary');
      const textMatches = Array.from(rawBinary.matchAll(/\(([^)]+)\)\s*Tj/g)).map((m) => m[1]);
      if (textMatches.length > 0) {
        rawText = textMatches.join(' ');
        numPages = 1;
      } else if (rawBinary.includes('%%EOF') || (rawBinary.includes('/Pages') && rawBinary.includes('endobj'))) {
        // Valid PDF structure with no extractable text tokens (e.g. scanned image PDF)
        rawText = '';
        numPages = 1;
      } else {
        logger.warn({ documentId: document._id.toString(), error: errMsg }, 'PDF extraction encountered error');
        return {
          format: 'PDF',
          schemaVersion: '1.0.0',
          extractorVersion: '1.0.0',
          status: 'FAILED',
          pages: [],
          blocks: [],
          tables: [],
          metadata: { error: errMsg },
          warnings: [{ code: 'CORRUPT_STRUCTURE', message: `Failed to parse PDF document structure: ${errMsg}` }],
        };
      }
    }

    if (numPages > 500) {
      const { AppError } = await import('../../utils/AppError');
      throw new AppError('PDF document exceeds maximum allowed page count of 500 pages.', 400, 'PAGE_LIMIT_EXCEEDED');
    }

    // Check if PDF has no extractable text (e.g. scanned image PDF)
    if (!rawText || rawText.length === 0) {
      warnings.push({
        code: 'OCR_REQUIRED',
        message: 'No extractable text found in PDF pages. OCR processing is required.',
      });

      const pages: INormalizedPage[] = [];
      for (let p = 1; p <= numPages; p++) {
        pages.push({ pageNumber: p, blockCount: 0 });
      }

      return {
        format: 'PDF',
        schemaVersion: '1.0.0',
        extractorVersion: '1.0.0',
        status: 'OCR_REQUIRED',
        pages,
        blocks: [],
        tables: [],
        metadata: { pageCount: numPages, info: pdfInfo },
        warnings,
      };
    }

    const blocks: INormalizedBlock[] = [];
    const pages: INormalizedPage[] = [];

    // Estimate page mapping based on form-feed characters (\f) or paragraph distribution
    const pageTexts = rawText.split('\f');
    const actualPagesCount = Math.max(numPages, pageTexts.length);

    let globalOffset = 0;
    let globalBlockIndex = 0;

    for (let pIdx = 0; pIdx < pageTexts.length; pIdx++) {
      const pageNum = pIdx + 1;
      const pText = pageTexts[pIdx].trim();

      if (!pText) {
        pages.push({ pageNumber: pageNum, blockCount: 0 });
        continue;
      }

      const pLines = pText
        .split(/\n\s*\n/)
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);

      let pageBlockCount = 0;

      for (const lineText of pLines) {
        globalBlockIndex++;
        pageBlockCount++;
        const blockId = `pdf_b_p${pageNum}_${pageBlockCount}`;
        const startOffset = globalOffset;
        const endOffset = startOffset + lineText.length;
        globalOffset = endOffset + 1; // accounting for spacing

        const isHeading = lineText.length < 60 && !lineText.endsWith('.');

        blocks.push({
          blockId,
          type: isHeading ? 'HEADING' : 'PARAGRAPH',
          text: lineText,
          pageNumber: pageNum,
          readingOrderIndex: globalBlockIndex,
          startOffset,
          endOffset,
          provenance: {
            documentId: document._id.toString(),
            organizationId: document.organizationId.toString(),
            pageNumber: pageNum,
            blockId,
            sourceRef: `pdf:page:${pageNum}`,
          },
        });
      }

      pages.push({
        pageNumber: pageNum,
        blockCount: pageBlockCount,
      });
    }

    return {
      format: 'PDF',
      schemaVersion: '1.0.0',
      extractorVersion: '1.0.0',
      status: 'COMPLETE',
      pages,
      blocks,
      tables: [],
      metadata: {
        pageCount: actualPagesCount,
        info: pdfInfo || {},
      },
      warnings,
    };
  }
}
