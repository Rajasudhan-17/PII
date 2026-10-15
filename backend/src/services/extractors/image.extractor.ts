import fs from 'fs';
import imageSize from 'image-size';
import { IDocumentExtractor, ExtractionResult } from './base.extractor';
import { IDocument } from '../../models/document.model';
import { INormalizedPage, ExtractionWarning } from '../../models/normalizedDocument.model';
import { validateImageDimensions } from '../../utils/fileValidation';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

export class ImageExtractor implements IDocumentExtractor {
  public async extract(document: IDocument, filePath: string): Promise<ExtractionResult> {
    const warnings: ExtractionWarning[] = [
      {
        code: 'OCR_REQUIRED',
        message: 'Image files require OCR processing for text content extraction. OCR is deferred to Phase 06.',
      },
    ];

    let dimensions: { width?: number; height?: number; type?: string } = {};
    try {
      // Read file header to parse dimensions without uncontrolled pixel buffer decoding
      const buffer = fs.readFileSync(filePath);
      dimensions = imageSize(buffer);
      if (dimensions.width && dimensions.height) {
        validateImageDimensions(dimensions.width, dimensions.height);
      }
    } catch (err) {
      if (err instanceof AppError && err.errorCode === 'IMAGE_DIMENSION_LIMIT_EXCEEDED') {
        throw err;
      }
      logger.warn({ documentId: document._id.toString(), error: (err as Error).message }, 'Failed to read image dimensions');
      warnings.push({
        code: 'PARSER_LIMITATION',
        message: 'Failed to inspect image header dimensions.',
      });
    }

    const pages: INormalizedPage[] = [
      {
        pageNumber: 1,
        width: dimensions.width,
        height: dimensions.height,
        blockCount: 0,
      },
    ];

    return {
      format: (dimensions.type || document.extension).toUpperCase(),
      schemaVersion: '1.0.0',
      extractorVersion: '1.0.0',
      status: 'OCR_REQUIRED',
      pages,
      blocks: [],
      tables: [],
      metadata: {
        width: dimensions.width,
        height: dimensions.height,
        imageType: dimensions.type,
      },
      warnings,
    };
  }
}
