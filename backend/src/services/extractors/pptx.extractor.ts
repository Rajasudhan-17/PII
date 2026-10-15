import AdmZip from 'adm-zip';
import { IDocumentExtractor, ExtractionResult } from './base.extractor';
import { IDocument } from '../../models/document.model';
import {
  INormalizedBlock,
  INormalizedPage,
  ExtractionWarning,
} from '../../models/normalizedDocument.model';
import { validateArchiveBounds } from '../../utils/fileValidation';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

export class PptxExtractor implements IDocumentExtractor {
  public async extract(document: IDocument, filePath: string): Promise<ExtractionResult> {
    const warnings: ExtractionWarning[] = [];

    let zip: AdmZip;
    try {
      zip = new AdmZip(filePath);
    } catch (err) {
      logger.warn({ documentId: document._id.toString(), error: (err as Error).message }, 'Malformed PPTX zip');
      return {
        format: 'PPTX',
        schemaVersion: '1.0.0',
        extractorVersion: '1.0.0',
        status: 'FAILED',
        pages: [],
        blocks: [],
        tables: [],
        metadata: {},
        warnings: [{ code: 'CORRUPT_STRUCTURE', message: 'Failed to open PPTX archive.' }],
      };
    }

    const zipEntries = zip.getEntries();
    let totalSize = 0;
    for (const entry of zipEntries) {
      const name = entry.entryName;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawName = (entry as any).rawEntryName ? (entry as any).rawEntryName.toString('utf8') : '';
      if (name.includes('..') || rawName.includes('..') || name.startsWith('/') || name.startsWith('\\')) {
        throw new AppError('Path traversal attempt detected in PPTX zip entry.', 400, 'ZIP_PATH_TRAVERSAL');
      }
      totalSize += entry.header.size;
    }

    validateArchiveBounds(zipEntries.length, totalSize);

    // Filter slide entries: ppt/slides/slide1.xml, slide2.xml...
    const slideEntries = zipEntries
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.replace(/\D/g, ''), 10);
        const numB = parseInt(b.entryName.replace(/\D/g, ''), 10);
        return numA - numB;
      });

    if (slideEntries.length === 0) {
      warnings.push({ code: 'EMPTY_PRESENTATION', message: 'No slides found in PPTX presentation.' });
    }

    const blocks: INormalizedBlock[] = [];
    const pages: INormalizedPage[] = [];

    let globalOffset = 0;
    let blockIndex = 0;

    for (let sIdx = 0; sIdx < slideEntries.length; sIdx++) {
      const slideEntry = slideEntries[sIdx];
      const slideNum = sIdx + 1;
      const slideXml = slideEntry.getData().toString('utf8');

      const texts = this.extractTextsFromXml(slideXml);
      let pageBlockCount = 0;

      if (texts.length > 0) {
        const slideText = texts.join(' ').trim();
        if (slideText) {
          blockIndex++;
          pageBlockCount++;
          const blockId = `pptx_b_s${slideNum}_${pageBlockCount}`;
          const startOffset = globalOffset;
          const endOffset = startOffset + slideText.length;
          globalOffset = endOffset + 1;

          blocks.push({
            blockId,
            type: 'TEXT',
            text: slideText,
            pageNumber: slideNum,
            containerName: slideEntry.entryName,
            readingOrderIndex: blockIndex,
            startOffset,
            endOffset,
            provenance: {
              documentId: document._id.toString(),
              organizationId: document.organizationId.toString(),
              pageNumber: slideNum,
              containerName: slideEntry.entryName,
              blockId,
            },
          });
        }
      }

      // Check speaker notes for this slide (ppt/notesSlides/notesSlide1.xml...)
      const notesEntry = zip.getEntry(`ppt/notesSlides/notesSlide${slideNum}.xml`);
      if (notesEntry) {
        const notesXml = notesEntry.getData().toString('utf8');
        const notesTexts = this.extractTextsFromXml(notesXml);
        if (notesTexts.length > 0) {
          const notesText = notesTexts.join(' ').trim();
          if (notesText) {
            blockIndex++;
            pageBlockCount++;
            const blockId = `pptx_notes_s${slideNum}`;
            const startOffset = globalOffset;
            const endOffset = startOffset + notesText.length;
            globalOffset = endOffset + 1;

            blocks.push({
              blockId,
              type: 'TEXT',
              text: `Speaker Notes: ${notesText}`,
              pageNumber: slideNum,
              containerName: notesEntry.entryName,
              readingOrderIndex: blockIndex,
              startOffset,
              endOffset,
              provenance: {
                documentId: document._id.toString(),
                organizationId: document.organizationId.toString(),
                pageNumber: slideNum,
                containerName: notesEntry.entryName,
                blockId,
              },
            });
          }
        }
      }

      pages.push({
        pageNumber: slideNum,
        blockCount: pageBlockCount,
      });
    }

    return {
      format: 'PPTX',
      schemaVersion: '1.0.0',
      extractorVersion: '1.0.0',
      status: 'COMPLETE',
      pages,
      blocks,
      tables: [],
      metadata: { slideCount: slideEntries.length },
      warnings,
    };
  }

  private extractTextsFromXml(xml: string): string[] {
    const textRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = textRegex.exec(xml)) !== null) {
      results.push(match[1]);
    }
    return results;
  }
}
