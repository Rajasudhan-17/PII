import fs from 'fs';
import { IDocumentExtractor, ExtractionResult } from './base.extractor';
import { IDocument } from '../../models/document.model';
import { INormalizedBlock, INormalizedPage, ExtractionWarning } from '../../models/normalizedDocument.model';

export class PlainTextExtractor implements IDocumentExtractor {
  public async extract(document: IDocument, filePath: string): Promise<ExtractionResult> {
    const warnings: ExtractionWarning[] = [];
    const buffer = await fs.promises.readFile(filePath);

    // Detect replacement characters indicating encoding issues
    const rawContent = buffer.toString('utf8');
    if (rawContent.includes('\uFFFD')) {
      warnings.push({
        code: 'ENCODING_UNCERTAIN',
        message: 'File contains invalid byte sequences converted to Unicode replacement characters.',
      });
    }

    const lines = rawContent
      .split(/\r?\n\s*\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const blocks: INormalizedBlock[] = [];
    let globalOffset = 0;
    let blockIndex = 0;

    for (const lineText of lines) {
      blockIndex++;
      const blockId = `txt_b_${blockIndex}`;
      const startOffset = globalOffset;
      const endOffset = startOffset + lineText.length;
      globalOffset = endOffset + 1;

      blocks.push({
        blockId,
        type: 'PARAGRAPH',
        text: lineText,
        pageNumber: 1,
        containerName: 'main',
        readingOrderIndex: blockIndex,
        startOffset,
        endOffset,
        provenance: {
          documentId: document._id.toString(),
          organizationId: document.organizationId.toString(),
          pageNumber: 1,
          blockId,
          sourceRef: `line:${blockIndex}`,
        },
      });
    }

    const pages: INormalizedPage[] = [{ pageNumber: 1, blockCount: blocks.length }];

    return {
      format: (document.extension || 'TXT').toUpperCase(),
      schemaVersion: '1.0.0',
      extractorVersion: '1.0.0',
      status: 'COMPLETE',
      pages,
      blocks,
      tables: [],
      metadata: { characterCount: rawContent.length, blockCount: blocks.length },
      warnings,
    };
  }
}
