import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { StructuralIntegrityVerifier } from '../../src/services/verification/verifiers/structuralIntegrityVerifier';

describe('StructuralIntegrityVerifier — Deep Parser / Decoder Structural Verification Unit Tests', () => {
  const scratchDir = path.join(process.cwd(), 'scratch', 'test_structural_parser');

  beforeAll(async () => {
    await fs.promises.mkdir(scratchDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  });

  test('Valid PDF parses cleanly and page count accessed -> VERIFIED', async () => {
    const validPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n162\n%%EOF',
      'binary'
    );
    const pdfPath = path.join(scratchDir, 'valid.pdf');
    await fs.promises.writeFile(pdfPath, validPdfBuffer);

    const res = await StructuralIntegrityVerifier.verify(pdfPath, 'pdf');
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });

  test('Corrupted PDF with magic bytes header BUT unparseable body -> FAILED', async () => {
    const pdfPath = path.join(scratchDir, 'corrupt.pdf');
    await fs.promises.writeFile(pdfPath, '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj corrupt_body_data %%EOF', 'binary');

    const res = await StructuralIntegrityVerifier.verify(pdfPath, 'pdf');
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAILED');
    expect(res.reasonCode).toBe('PDF_PARSE_FAILED');
  });

  test('Valid DOCX with word/document.xml entry -> VERIFIED', async () => {
    const docxPath = path.join(scratchDir, 'valid.docx');
    const zip = new AdmZip();
    zip.addFile('word/document.xml', Buffer.from('<w:document><w:body/></w:document>', 'utf8'));
    zip.writeZip(docxPath);

    const res = await StructuralIntegrityVerifier.verify(docxPath, 'docx');
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });

  test('Corrupted DOCX with magic bytes PK BUT missing core word/document.xml entry -> FAILED', async () => {
    const docxPath = path.join(scratchDir, 'corrupt.docx');
    const zip = new AdmZip();
    zip.addFile('invalid_folder/file.xml', Buffer.from('<xml/>', 'utf8'));
    zip.writeZip(docxPath);

    const res = await StructuralIntegrityVerifier.verify(docxPath, 'docx');
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAILED');
    expect(res.reasonCode).toBe('OOXML_PACKAGE_CORRUPT');
  });

  test('Corrupted XLSX missing xl/workbook.xml -> FAILED', async () => {
    const xlsxPath = path.join(scratchDir, 'corrupt.xlsx');
    const zip = new AdmZip();
    zip.addFile('bad_sheet.xml', Buffer.from('<xml/>', 'utf8'));
    zip.writeZip(xlsxPath);

    const res = await StructuralIntegrityVerifier.verify(xlsxPath, 'xlsx');
    expect(res.passed).toBe(false);
    expect(res.reasonCode).toBe('OOXML_PACKAGE_CORRUPT');
  });

  test('Corrupted PPTX missing ppt/presentation.xml -> FAILED', async () => {
    const pptxPath = path.join(scratchDir, 'corrupt.pptx');
    const zip = new AdmZip();
    zip.addFile('bad_slide.xml', Buffer.from('<xml/>', 'utf8'));
    zip.writeZip(pptxPath);

    const res = await StructuralIntegrityVerifier.verify(pptxPath, 'pptx');
    expect(res.passed).toBe(false);
    expect(res.reasonCode).toBe('OOXML_PACKAGE_CORRUPT');
  });

  test('Valid PNG decodes cleanly -> VERIFIED', async () => {
    // Valid 1x1 red PNG buffer
    const validPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const pngPath = path.join(scratchDir, 'valid.png');
    await fs.promises.writeFile(pngPath, validPngBuffer);

    const res = await StructuralIntegrityVerifier.verify(pngPath, 'png');
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });

  test('Corrupted PNG with magic bytes BUT corrupted image stream -> FAILED', async () => {
    const pngPath = path.join(scratchDir, 'corrupt.png');
    const corruptPngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('corrupt_image_bytes_here', 'utf8'),
    ]);
    await fs.promises.writeFile(pngPath, corruptPngBuffer);

    const res = await StructuralIntegrityVerifier.verify(pngPath, 'png');
    expect(res.passed).toBe(false);
    expect(res.reasonCode).toBe('IMAGE_DECODE_FAILED');
  });
});
