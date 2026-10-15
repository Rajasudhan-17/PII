import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { PdfExtractor } from '../../src/services/extractors/pdf.extractor';
import { DocxExtractor } from '../../src/services/extractors/docx.extractor';
import { XlsxExtractor } from '../../src/services/extractors/xlsx.extractor';
import { PptxExtractor } from '../../src/services/extractors/pptx.extractor';
import { PlainTextExtractor } from '../../src/services/extractors/text.extractor';
import { ImageExtractor } from '../../src/services/extractors/image.extractor';
import { IDocument } from '../../src/models/document.model';

const mockDocument = (ext: string, mime: string): IDocument =>
  ({
    _id: new mongoose.Types.ObjectId(),
    organizationId: new mongoose.Types.ObjectId(),
    uploadedBy: new mongoose.Types.ObjectId(),
    originalFilename: `sample.${ext}`,
    size: 1024,
    declaredMimeType: mime,
    detectedMimeType: mime,
    extension: ext,
    storageKey: `orgs/123/docs/sample.${ext}`,
    status: 'READY',
    checksum: 'a1b2c3d4e5f6',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as IDocument);

describe('Phase 05 Extractor Unit Tests', () => {
  const tmpDir = path.resolve(process.cwd(), 'storage/test_extractors_tmp');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(tmpDir)) {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe('PlainTextExtractor', () => {
    const extractor = new PlainTextExtractor();

    test('extracts UTF-8 multilingual text preserving line blocks and exact offsets', async () => {
      const txtPath = path.join(tmpDir, 'test.txt');
      const content = 'John Smith lives in Chennai.\n\nTamil: தமிழ் வாழ்க.\n\nHindi: नमस्ते दुनिया!';
      await fs.promises.writeFile(txtPath, content, 'utf8');

      const doc = mockDocument('txt', 'text/plain');
      const result = await extractor.extract(doc, txtPath);

      expect(result.format).toBe('TXT');
      expect(result.status).toBe('COMPLETE');
      expect(result.blocks.length).toBe(3);
      expect(result.blocks[0].text).toBe('John Smith lives in Chennai.');
      expect(result.blocks[1].text).toBe('Tamil: தமிழ் வாழ்க.');
      expect(result.blocks[2].text).toBe('Hindi: नमस्ते दुनिया!');
      expect(result.blocks[0].startOffset).toBe(0);
      expect(result.blocks[0].provenance.documentId).toBe(doc._id.toString());
    });
  });

  describe('ImageExtractor', () => {
    const extractor = new ImageExtractor();

    test('inspects image header without performing OCR or fabricating text', async () => {
      const imgPath = path.join(tmpDir, 'test.png');
      // 1x1 PNG binary payload
      const pngBuffer = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082',
        'hex'
      );
      await fs.promises.writeFile(imgPath, pngBuffer);

      const doc = mockDocument('png', 'image/png');
      const result = await extractor.extract(doc, imgPath);

      expect(result.status).toBe('OCR_REQUIRED');
      expect(result.blocks.length).toBe(0);
      expect(result.warnings.some((w) => w.code === 'OCR_REQUIRED')).toBe(true);
      expect(result.pages[0].width).toBe(1);
      expect(result.pages[0].height).toBe(1);
    });
  });

  describe('PdfExtractor Scanned & Password Handling', () => {
    const extractor = new PdfExtractor();

    test('handles fake/corrupt PDF gracefully returning FAILED status', async () => {
      const pdfPath = path.join(tmpDir, 'fake.pdf');
      await fs.promises.writeFile(pdfPath, '%PDF-1.4 Fake PDF Content');

      const doc = mockDocument('pdf', 'application/pdf');
      const result = await extractor.extract(doc, pdfPath);

      expect(result.format).toBe('PDF');
      expect(result.status).toBe('FAILED');
      expect(result.warnings.some((w) => w.code === 'CORRUPT_STRUCTURE')).toBe(true);
    });
  });

  describe('DocxExtractor', () => {
    const extractor = new DocxExtractor();

    test('returns FAILED for corrupt non-zip docx file', async () => {
      const docxPath = path.join(tmpDir, 'corrupt.docx');
      await fs.promises.writeFile(docxPath, 'Invalid non-zip content');

      const doc = mockDocument('docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const result = await extractor.extract(doc, docxPath);

      expect(result.format).toBe('DOCX');
      expect(result.status).toBe('FAILED');
      expect(result.warnings[0].code).toBe('CORRUPT_STRUCTURE');
    });
  });

  describe('XlsxExtractor', () => {
    const extractor = new XlsxExtractor();

    test('returns FAILED for corrupt xlsx file', async () => {
      const xlsxPath = path.join(tmpDir, 'corrupt.xlsx');
      await fs.promises.writeFile(xlsxPath, 'Invalid non-zip content');

      const doc = mockDocument('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const result = await extractor.extract(doc, xlsxPath);

      expect(result.format).toBe('XLSX');
      expect(result.status).toBe('FAILED');
      expect(result.warnings[0].code).toBe('CORRUPT_STRUCTURE');
    });
  });

  describe('PptxExtractor', () => {
    const extractor = new PptxExtractor();

    test('returns FAILED for corrupt pptx file', async () => {
      const pptxPath = path.join(tmpDir, 'corrupt.pptx');
      await fs.promises.writeFile(pptxPath, 'Invalid non-zip content');

      const doc = mockDocument('pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      const result = await extractor.extract(doc, pptxPath);

      expect(result.format).toBe('PPTX');
      expect(result.status).toBe('FAILED');
      expect(result.warnings[0].code).toBe('CORRUPT_STRUCTURE');
    });
  });
});
