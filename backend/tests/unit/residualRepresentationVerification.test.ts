import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { PiiResidualVerifier } from '../../src/services/verification/verifiers/piiResidualVerifier';

describe('PiiResidualVerifier — Representation-Aware Residual Verification Unit Tests', () => {
  const scratchDir = path.join(process.cwd(), 'scratch', 'test_residual_representation');

  beforeAll(async () => {
    await fs.promises.mkdir(scratchDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  });

  test('PDF candidate survives in stream -> FAILED', async () => {
    const pdfPath = path.join(scratchDir, 'test.pdf');
    await fs.promises.writeFile(pdfPath, '%PDF-1.4 stream alice@example.test endstream', 'binary');
    const res = await PiiResidualVerifier.verify(pdfPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAILED');
    expect(res.reasonCode).toBe('RESIDUAL_DIRECT_IDENTIFIER_OBSERVED');
  });

  test('PDF candidate successfully removed -> VERIFIED', async () => {
    const pdfPath = path.join(scratchDir, 'clean.pdf');
    await fs.promises.writeFile(pdfPath, '%PDF-1.4 stream [REDACTED] endstream', 'binary');
    const res = await PiiResidualVerifier.verify(pdfPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });

  test('DOCX candidate survives in word/document.xml -> FAILED', async () => {
    const docxPath = path.join(scratchDir, 'test.docx');
    const zip = new AdmZip();
    zip.addFile('word/document.xml', Buffer.from('<w:t>alice@example.test</w:t>', 'utf8'));
    zip.writeZip(docxPath);

    const res = await PiiResidualVerifier.verify(docxPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAILED');
  });

  test('DOCX candidate successfully removed -> VERIFIED', async () => {
    const docxPath = path.join(scratchDir, 'clean.docx');
    const zip = new AdmZip();
    zip.addFile('word/document.xml', Buffer.from('<w:t>[REDACTED]</w:t>', 'utf8'));
    zip.writeZip(docxPath);

    const res = await PiiResidualVerifier.verify(docxPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });

  test('XLSX candidate survives in sharedStrings.xml -> FAILED', async () => {
    const xlsxPath = path.join(scratchDir, 'test.xlsx');
    const zip = new AdmZip();
    zip.addFile('xl/sharedStrings.xml', Buffer.from('<t>alice@example.test</t>', 'utf8'));
    zip.writeZip(xlsxPath);

    const res = await PiiResidualVerifier.verify(xlsxPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAILED');
  });

  test('XLSX candidate successfully removed -> VERIFIED', async () => {
    const xlsxPath = path.join(scratchDir, 'clean.xlsx');
    const zip = new AdmZip();
    zip.addFile('xl/sharedStrings.xml', Buffer.from('<t>[REDACTED]</t>', 'utf8'));
    zip.writeZip(xlsxPath);

    const res = await PiiResidualVerifier.verify(xlsxPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });

  test('PPTX candidate survives in slide -> FAILED', async () => {
    const pptxPath = path.join(scratchDir, 'test.pptx');
    const zip = new AdmZip();
    zip.addFile('ppt/slides/slide1.xml', Buffer.from('<a:t>alice@example.test</a:t>', 'utf8'));
    zip.writeZip(pptxPath);

    const res = await PiiResidualVerifier.verify(pptxPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAILED');
  });

  test('PPTX candidate successfully removed -> VERIFIED', async () => {
    const pptxPath = path.join(scratchDir, 'clean.pptx');
    const zip = new AdmZip();
    zip.addFile('ppt/slides/slide1.xml', Buffer.from('<a:t>[REDACTED]</a:t>', 'utf8'));
    zip.writeZip(pptxPath);

    const res = await PiiResidualVerifier.verify(pptxPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });

  test('TXT candidate survives -> FAILED', async () => {
    const txtPath = path.join(scratchDir, 'test.txt');
    await fs.promises.writeFile(txtPath, 'User email is alice@example.test', 'utf8');
    const res = await PiiResidualVerifier.verify(txtPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(false);
  });

  test('TXT candidate successfully removed -> VERIFIED', async () => {
    const txtPath = path.join(scratchDir, 'clean.txt');
    await fs.promises.writeFile(txtPath, 'User email is [REDACTED]', 'utf8');
    const res = await PiiResidualVerifier.verify(txtPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(true);
  });

  test('CSV candidate survives -> FAILED', async () => {
    const csvPath = path.join(scratchDir, 'test.csv');
    await fs.promises.writeFile(csvPath, 'id,name,email\n1,Alice,alice@example.test', 'utf8');
    const res = await PiiResidualVerifier.verify(csvPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(false);
  });

  test('CSV candidate successfully removed -> VERIFIED', async () => {
    const csvPath = path.join(scratchDir, 'clean.csv');
    await fs.promises.writeFile(csvPath, 'id,name,email\n1,Alice,[REDACTED]', 'utf8');
    const res = await PiiResidualVerifier.verify(csvPath, 'REDACT', ['alice@example.test']);
    expect(res.passed).toBe(true);
  });

  test('Unsupported extension returns NOT_VERIFIABLE', async () => {
    const unsupportedPath = path.join(scratchDir, 'test.xyz');
    await fs.promises.writeFile(unsupportedPath, 'data', 'utf8');
    const res = await PiiResidualVerifier.verify(unsupportedPath, 'REDACT', ['alice@example.test']);
    expect(res.status).toBe('NOT_VERIFIABLE');
    expect(res.reasonCode).toBe('UNSUPPORTED_REPRESENTATION_FORMAT');
  });
});
