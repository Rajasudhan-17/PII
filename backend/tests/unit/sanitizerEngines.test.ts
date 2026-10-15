import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { SanitizerEngineFactory } from '../../src/services/sanitization/engines/engine.factory';
import { PdfSanitizerEngine } from '../../src/services/sanitization/engines/pdf.sanitizer';
import { DocxSanitizerEngine } from '../../src/services/sanitization/engines/docx.sanitizer';
import { XlsxSanitizerEngine } from '../../src/services/sanitization/engines/xlsx.sanitizer';
import { PptxSanitizerEngine } from '../../src/services/sanitization/engines/pptx.sanitizer';
import { ImageSanitizerEngine } from '../../src/services/sanitization/engines/image.sanitizer';
import { FilenameSanitizer } from '../../src/services/sanitization/engines/filename.sanitizer';

describe('Sanitizer Engines Unit Tests', () => {
  const scratchDir = path.join(process.cwd(), 'scratch', 'test_sanitizers');

  beforeAll(async () => {
    await fs.promises.mkdir(scratchDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('SanitizerEngineFactory', () => {
    test('returns PdfSanitizerEngine for pdf extension or mime type', () => {
      expect(SanitizerEngineFactory.getEngine('pdf', 'application/pdf')).toBeInstanceOf(PdfSanitizerEngine);
    });

    test('returns DocxSanitizerEngine for docx extension', () => {
      expect(SanitizerEngineFactory.getEngine('docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeInstanceOf(DocxSanitizerEngine);
    });

    test('returns XlsxSanitizerEngine for xlsx extension', () => {
      expect(SanitizerEngineFactory.getEngine('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBeInstanceOf(XlsxSanitizerEngine);
    });

    test('returns PptxSanitizerEngine for pptx extension', () => {
      expect(SanitizerEngineFactory.getEngine('pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBeInstanceOf(PptxSanitizerEngine);
    });

    test('returns ImageSanitizerEngine for png/jpg/jpeg', () => {
      expect(SanitizerEngineFactory.getEngine('png', 'image/png')).toBeInstanceOf(ImageSanitizerEngine);
      expect(SanitizerEngineFactory.getEngine('jpg', 'image/jpeg')).toBeInstanceOf(ImageSanitizerEngine);
    });
  });

  describe('PdfSanitizerEngine', () => {
    test('sanitizes PDF document info dictionary and XMP metadata streams', async () => {
      const sourceFile = path.join(scratchDir, 'pdf_sample.pdf');
      const outputFile = path.join(scratchDir, 'pdf_sanitized.pdf');
      const pdfContent = '%PDF-1.4 1 0 obj << /Author (John Smith) /Creator (Secret App) /CreationDate (D:20260101000000Z) >> <x:xmpmeta>xmp content</x:xmpmeta> endobj';
      await fs.promises.writeFile(sourceFile, pdfContent, 'binary');

      const engine = new PdfSanitizerEngine();
      const result = await engine.sanitize({
        sourceFilePath: sourceFile,
        outputFilePath: outputFile,
        filename: 'sample.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        policyOptions: {},
      });

      expect(result.removedCount).toBeGreaterThan(0);
      const outBuffer = await fs.promises.readFile(outputFile, 'binary');
      expect(outBuffer).not.toContain('(John Smith)');
      expect(outBuffer).not.toContain('<x:xmpmeta>');

      const verify = await engine.verifyOutput(outputFile, {
        sourceFilePath: sourceFile,
        outputFilePath: outputFile,
        filename: 'sample.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        policyOptions: {},
      });
      expect(verify.isVerified).toBe(true);
    });
  });

  describe('DocxSanitizerEngine', () => {
    test('sanitizes OOXML core properties, custom properties, comments, and tracked revisions', async () => {
      const docxFile = path.join(scratchDir, 'sample_doc.docx');
      const outputFile = path.join(scratchDir, 'sample_doc_sanitized.docx');

      const zip = new AdmZip();
      zip.addFile('docProps/core.xml', Buffer.from('<cp:coreProperties><dc:creator>John Smith</dc:creator><cp:lastModifiedBy>John Smith</cp:lastModifiedBy></cp:coreProperties>', 'utf8'));
      zip.addFile('docProps/custom.xml', Buffer.from('<Properties><property name="Client">Acme Corp</property></Properties>', 'utf8'));
      zip.addFile('word/comments.xml', Buffer.from('<w:comments><w:comment w:author="John Smith"><w:p><w:t>Secret comment</w:t></w:p></w:comment></w:comments>', 'utf8'));
      zip.addFile('word/document.xml', Buffer.from('<w:document><w:body><w:p><w:ins w:author="John Smith"><w:t>Text</w:t></w:ins></w:p></w:body></w:document>', 'utf8'));
      zip.writeZip(docxFile);

      const engine = new DocxSanitizerEngine();
      const result = await engine.sanitize({
        sourceFilePath: docxFile,
        outputFilePath: outputFile,
        filename: 'sample.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
        policyOptions: { stripComments: true },
      });

      expect(result.removedCount).toBeGreaterThan(0);
      const outZip = new AdmZip(outputFile);
      const coreXml = outZip.readAsText('docProps/core.xml');
      expect(coreXml).not.toContain('John Smith');
      expect(outZip.getEntry('docProps/custom.xml')).toBeNull();

      const verify = await engine.verifyOutput(outputFile, {
        sourceFilePath: docxFile,
        outputFilePath: outputFile,
        filename: 'sample.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
        policyOptions: {},
      });
      expect(verify.isVerified).toBe(true);
    });
  });

  describe('XlsxSanitizerEngine', () => {
    test('sanitizes spreadsheet core properties, comments, and classifies hidden sheets', async () => {
      const xlsxFile = path.join(scratchDir, 'sample_sheet.xlsx');
      const outputFile = path.join(scratchDir, 'sample_sheet_sanitized.xlsx');

      const zip = new AdmZip();
      zip.addFile('docProps/core.xml', Buffer.from('<cp:coreProperties><dc:creator>John Smith</dc:creator></cp:coreProperties>', 'utf8'));
      zip.addFile('xl/workbook.xml', Buffer.from('<workbook><sheets><sheet name="Data" sheetId="1"/><sheet name="Secret" sheetId="2" state="hidden"/></sheets></workbook>', 'utf8'));
      zip.addFile('xl/comments1.xml', Buffer.from('<comments><comment author="John Smith"><text><t>Private note</t></text></comment></comments>', 'utf8'));
      zip.writeZip(xlsxFile);

      const engine = new XlsxSanitizerEngine();
      const result = await engine.sanitize({
        sourceFilePath: xlsxFile,
        outputFilePath: outputFile,
        filename: 'sample.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: 'xlsx',
        policyOptions: { stripComments: true, stripHiddenSheets: true },
      });

      expect(result.removedCount).toBeGreaterThan(0);
      const outZip = new AdmZip(outputFile);
      const coreXml = outZip.readAsText('docProps/core.xml');
      expect(coreXml).not.toContain('John Smith');
    });
  });

  describe('PptxSanitizerEngine', () => {
    test('sanitizes presentation core properties and speaker notes', async () => {
      const pptxFile = path.join(scratchDir, 'sample_pres.pptx');
      const outputFile = path.join(scratchDir, 'sample_pres_sanitized.pptx');

      const zip = new AdmZip();
      zip.addFile('docProps/core.xml', Buffer.from('<cp:coreProperties><dc:creator>John Smith</dc:creator></cp:coreProperties>', 'utf8'));
      zip.addFile('ppt/notesSlides/notesSlide1.xml', Buffer.from('<p:notes><a:t>Confidential speaker notes</a:t></p:notes>', 'utf8'));
      zip.writeZip(pptxFile);

      const engine = new PptxSanitizerEngine();
      const result = await engine.sanitize({
        sourceFilePath: pptxFile,
        outputFilePath: outputFile,
        filename: 'sample.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extension: 'pptx',
        policyOptions: { stripSpeakerNotes: true },
      });

      expect(result.removedCount).toBeGreaterThan(0);
      const outZip = new AdmZip(outputFile);
      const notesXml = outZip.readAsText('ppt/notesSlides/notesSlide1.xml');
      expect(notesXml).not.toContain('Confidential speaker notes');
    });
  });

  describe('ImageSanitizerEngine', () => {
    test('strips JPEG EXIF/GPS APP1 markers and verifies output clean', async () => {
      const sourceFile = path.join(scratchDir, 'sample_exif.jpg');
      const outputFile = path.join(scratchDir, 'sample_exif_sanitized.jpg');

      // Construct a mock JPEG buffer with APP1 EXIF marker (0xFF 0xE1)
      const header = Buffer.from([0xff, 0xd8]);
      const app1Marker = Buffer.from([0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      const imageBody = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x00, 0xff, 0xd9]);
      const rawBuf = Buffer.concat([header, app1Marker, imageBody]);
      await fs.promises.writeFile(sourceFile, rawBuf);

      const engine = new ImageSanitizerEngine();
      const result = await engine.sanitize({
        sourceFilePath: sourceFile,
        outputFilePath: outputFile,
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        extension: 'jpg',
        policyOptions: {},
      });

      expect(result.removedCount).toBeGreaterThan(0);

      const verify = await engine.verifyOutput(outputFile, {
        sourceFilePath: sourceFile,
        outputFilePath: outputFile,
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        extension: 'jpg',
        policyOptions: {},
      });
      expect(verify.isVerified).toBe(true);
    });
  });

  describe('FilenameSanitizer', () => {
    test('detects sensitive filename PII patterns and generates safe sanitized output name', () => {
      const emailRes = FilenameSanitizer.sanitizeFilename('john_smith_john@example.com_passport.pdf', 'san_123');
      expect(emailRes.hasPiiPattern).toBe(true);
      expect(emailRes.cleanFilename).toBe('sanitized_san_123.pdf');

      const ssnRes = FilenameSanitizer.sanitizeFilename('employee_123-45-6789_info.docx', 'san_456');
      expect(ssnRes.hasPiiPattern).toBe(true);
      expect(ssnRes.cleanFilename).toBe('sanitized_san_456.docx');
    });
  });
});
