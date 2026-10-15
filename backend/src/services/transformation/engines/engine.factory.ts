import { ITransformationEngine } from './base.engine';
import { PdfEngine } from './pdf.engine';
import { DocxEngine } from './docx.engine';
import { XlsxEngine } from './xlsx.engine';
import { TextEngine } from './text.engine';
import { ImageEngine } from './image.engine';
import { PptxEngine } from './pptx.engine';

export class TransformationEngineFactory {
  public static getEngine(extension: string, mimeType: string): ITransformationEngine {
    const ext = extension.toLowerCase().replace(/^\./, '');
    const mime = mimeType.toLowerCase();

    if (ext === 'pdf' || mime.includes('pdf')) {
      return new PdfEngine();
    }

    if (ext === 'docx' || mime.includes('wordprocessingml')) {
      return new DocxEngine();
    }

    if (ext === 'pptx' || mime.includes('presentationml')) {
      return new PptxEngine();
    }

    if (ext === 'xlsx' || mime.includes('spreadsheetml') || ext === 'xls') {
      return new XlsxEngine();
    }

    if (ext === 'txt' || ext === 'csv' || ext === 'log' || mime.includes('text/plain') || mime.includes('text/csv')) {
      return new TextEngine();
    }

    if (['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'gif'].includes(ext) || mime.includes('image/')) {
      return new ImageEngine();
    }

    // Default fallback to text engine for general text formats
    return new TextEngine();
  }
}
