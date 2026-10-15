import { ISanitizerEngine } from './base.engine';
import { PdfSanitizerEngine } from './pdf.sanitizer';
import { DocxSanitizerEngine } from './docx.sanitizer';
import { XlsxSanitizerEngine } from './xlsx.sanitizer';
import { PptxSanitizerEngine } from './pptx.sanitizer';
import { ImageSanitizerEngine } from './image.sanitizer';

export class SanitizerEngineFactory {
  public static getEngine(extension: string, mimeType: string): ISanitizerEngine {
    const ext = extension.toLowerCase().replace(/^\./, '');
    const mime = mimeType.toLowerCase();

    if (ext === 'pdf' || mime.includes('pdf')) {
      return new PdfSanitizerEngine();
    }

    if (ext === 'docx' || mime.includes('wordprocessingml')) {
      return new DocxSanitizerEngine();
    }

    if (ext === 'xlsx' || mime.includes('spreadsheetml') || ext === 'xls') {
      return new XlsxSanitizerEngine();
    }

    if (ext === 'pptx' || mime.includes('presentationml')) {
      return new PptxSanitizerEngine();
    }

    if (['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'gif'].includes(ext) || mime.includes('image/')) {
      return new ImageSanitizerEngine();
    }

    // Default fallback to image sanitizer engine for general binary files
    return new ImageSanitizerEngine();
  }
}
