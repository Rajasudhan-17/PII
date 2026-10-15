import fs from 'fs';
import path from 'path';
import { IndependentMetadataVerifier } from '../../src/services/sanitization/verification/verifier.factory';
import { PdfSanitizerEngine } from '../../src/services/sanitization/engines/pdf.sanitizer';
import { DocxSanitizerEngine } from '../../src/services/sanitization/engines/docx.sanitizer';
import { ImageSanitizerEngine } from '../../src/services/sanitization/engines/image.sanitizer';
import { FilenameMetadataVerifier } from '../../src/services/sanitization/verification/filename.metadata.verifier';

describe('Independent Metadata Verifier Architecture Unit Tests', () => {
  const tmpDir = path.join(process.cwd(), 'scratch', 'test_verifier_tmp');

  beforeAll(async () => {
    await fs.promises.mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  test('PROOFOF INDEPENDENCE: verifier does NOT invoke sanitizer engine verifyOutput method', async () => {
    const pdfPath = path.join(tmpDir, 'test_clean.pdf');
    await fs.promises.writeFile(
      pdfPath,
      '%PDF-1.4 1 0 obj << /Author (Sanitized) >> stream (Clean) endstream endobj',
      'binary'
    );

    const pdfSpy = jest.spyOn(PdfSanitizerEngine.prototype, 'verifyOutput');
    const docxSpy = jest.spyOn(DocxSanitizerEngine.prototype, 'verifyOutput');
    const imageSpy = jest.spyOn(ImageSanitizerEngine.prototype, 'verifyOutput');

    const result = await IndependentMetadataVerifier.verifyOutputArtifact({
      outputPath: pdfPath,
      mimeType: 'application/pdf',
      extension: 'pdf',
      publishedFilename: 'sanitized_run_123.pdf',
    });

    expect(result.isVerified).toBe(true);
    expect(pdfSpy).not.toHaveBeenCalled();
    expect(docxSpy).not.toHaveBeenCalled();
    expect(imageSpy).not.toHaveBeenCalled();

    pdfSpy.mockRestore();
    docxSpy.mockRestore();
    imageSpy.mockRestore();
  });

  test('PDF Verifier independently detects residual /Author and XMP metadata stream', async () => {
    const dirtyPdf = path.join(tmpDir, 'dirty.pdf');
    await fs.promises.writeFile(
      dirtyPdf,
      '%PDF-1.4 1 0 obj << /Author (John Smith) >> <x:xmpmeta>residual xmp</x:xmpmeta> endobj',
      'binary'
    );

    const report = await IndependentMetadataVerifier.verifyOutputArtifact({
      outputPath: dirtyPdf,
      mimeType: 'application/pdf',
      extension: 'pdf',
      publishedFilename: 'sanitized_dirty.pdf',
    });

    expect(report.isVerified).toBe(false);
    expect(report.residualMetadataCount).toBeGreaterThanOrEqual(1);
    expect(report.items.some((i) => i.verificationStatus === 'PRESENT_AND_REQUIRES_REMOVAL')).toBe(true);
  });

  test('Image Verifier independently detects residual JPEG APP1 EXIF marker (0xFFE1)', async () => {
    const jpegPath = path.join(tmpDir, 'dirty.jpg');
    // JPEG header 0xFF 0xD8 + APP1 marker 0xFF 0xE1 + len 0x00 0x08 + dummy data
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0xff, 0xd9]);
    await fs.promises.writeFile(jpegPath, jpegBuffer);

    const report = await IndependentMetadataVerifier.verifyOutputArtifact({
      outputPath: jpegPath,
      mimeType: 'image/jpeg',
      extension: 'jpg',
      publishedFilename: 'sanitized_dirty.jpg',
    });

    expect(report.isVerified).toBe(false);
    expect(report.items.some((i) => i.targetPath === 'APP1_MARKER_0xFFE1' && i.verificationStatus === 'PRESENT_AND_REQUIRES_REMOVAL')).toBe(true);
  });

  test('Filename Verifier flags filenames containing SSN, email, or sensitive keywords', () => {
    const ssnRes = FilenameMetadataVerifier.verify('sanitized_123-45-6789_passport.docx');
    expect(ssnRes.isVerified).toBe(false);
    expect(ssnRes.residualMetadataCount).toBe(1);

    const cleanRes = FilenameMetadataVerifier.verify('sanitized_run_abc123.docx');
    expect(cleanRes.isVerified).toBe(true);
    expect(cleanRes.residualMetadataCount).toBe(0);
  });
});
