import { IDocumentExtractor } from './base.extractor';
import { PdfExtractor } from './pdf.extractor';
import { DocxExtractor } from './docx.extractor';
import { XlsxExtractor } from './xlsx.extractor';
import { PptxExtractor } from './pptx.extractor';
import { PlainTextExtractor } from './text.extractor';
import { ImageExtractor } from './image.extractor';
import { IDocument } from '../../models/document.model';
import { AppError } from '../../utils/AppError';

export class ExtractorFactory {
  private pdfExtractor = new PdfExtractor();
  private docxExtractor = new DocxExtractor();
  private xlsxExtractor = new XlsxExtractor();
  private pptxExtractor = new PptxExtractor();
  private textExtractor = new PlainTextExtractor();
  private imageExtractor = new ImageExtractor();

  public getExtractor(document: IDocument): IDocumentExtractor {
    const ext = document.extension.toLowerCase().replace(/^\./, '');

    switch (ext) {
      case 'pdf':
        return this.pdfExtractor;
      case 'docx':
        return this.docxExtractor;
      case 'xlsx':
        return this.xlsxExtractor;
      case 'pptx':
        return this.pptxExtractor;
      case 'txt':
      case 'csv':
        return this.textExtractor;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'tiff':
        return this.imageExtractor;
      default:
        throw new AppError(
          `No content extractor available for format extension: ${ext}`,
          400,
          'UNSUPPORTED_EXTRACTION_FORMAT'
        );
    }
  }
}

export const extractorFactory = new ExtractorFactory();
