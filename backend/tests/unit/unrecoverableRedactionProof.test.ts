import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import AdmZip from 'adm-zip';
import { PNG } from 'pngjs';
import { PdfEngine } from '../../src/services/transformation/engines/pdf.engine';
import { DocxEngine } from '../../src/services/transformation/engines/docx.engine';
import { ImageEngine } from '../../src/services/transformation/engines/image.engine';
import { PdfSanitizerEngine } from '../../src/services/sanitization/engines/pdf.sanitizer';
import { DocxSanitizerEngine } from '../../src/services/sanitization/engines/docx.sanitizer';
import { MutationGenerator } from '../../src/services/transformation/mutationGenerator';
import { IPIICandidate } from '../../src/models/piiCandidate.model';
import { IDecisionResult } from '../../src/models/decisionResult.model';
import { PIIType, PIICategory } from '../../src/config/piiTaxonomy';

describe('Unrecoverable Redaction Proof — Adversarial Leakage Verification', () => {
  const scratchDir = path.join(process.cwd(), 'scratch', 'unrecoverable_proof');

  beforeAll(async () => {
    await fs.promises.mkdir(scratchDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  });

  const mutationGen = new MutationGenerator({
    transformationRunId: 'trans_unrec_1',
    seed: 'seed_unrec_1',
  });

  // ── TEST 1: PDF UNRECOVERABILITY PROOF ───────────────────────────────────────
  test('PDF: Redacted PII cannot be recovered from content streams, annotations, or metadata', async () => {
    const sourcePdf = path.join(scratchDir, 'adversarial_input.pdf');
    const transformedPdf = path.join(scratchDir, 'adversarial_transformed.pdf');
    const sanitizedPdf = path.join(scratchDir, 'adversarial_sanitized.pdf');

    const sensitiveName = 'Sarah Connor';
    const sensitiveSSN = '123-45-6789';
    const sensitiveDob = '14/03/1989';

    // Construct a real PDF structure with Flate-compressed content stream, annotations, and metadata
    const streamBody = `BT /F1 12 Tf 72 712 Td (${sensitiveName}) Tj 0 -20 Td (DOB: ${sensitiveDob}) Tj 0 -20 Td (SSN: ${sensitiveSSN}) Tj ET`;
    const compressedStream = zlib.deflateSync(Buffer.from(streamBody, 'latin1'));

    let pdfContent = `%PDF-1.4\n`;
    pdfContent += `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    pdfContent += `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
    pdfContent += `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Annots [5 0 R] >>\nendobj\n`;
    pdfContent += `4 0 obj\n<< /Filter /FlateDecode /Length ${compressedStream.length} >>\nstream\n${compressedStream.toString('binary')}\nendstream\nendobj\n`;
    pdfContent += `5 0 obj\n<< /Type /Annot /Subtype /Text /Contents (Confidential SSN: ${sensitiveSSN}) >>\nendobj\n`;
    pdfContent += `6 0 obj\n<< /Author (${sensitiveName}) /Creator (Adversarial Test) >>\nendobj\n`;
    pdfContent += `xref\n0 7\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000215 00000 n \n0000000300 00000 n \n0000000380 00000 n \n`;
    pdfContent += `trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n450\n%%EOF\n`;

    await fs.promises.writeFile(sourcePdf, Buffer.from(pdfContent, 'binary'));

    // Candidates to redact
    const candidates = [
      {
        candidateId: 'cand_pdf_name',
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: sensitiveName,
        location: { pageNumber: 1 },
      } as unknown as IPIICandidate,
      {
        candidateId: 'cand_pdf_ssn',
        type: PIIType.US_SSN,
        category: PIICategory.GOVERNMENT_ID,
        text: sensitiveSSN,
        location: { pageNumber: 1 },
      } as unknown as IPIICandidate,
      {
        candidateId: 'cand_pdf_dob',
        type: PIIType.DATE_OF_BIRTH,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: sensitiveDob,
        location: { pageNumber: 1 },
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_pdf_name', { candidateId: 'cand_pdf_name', decision: 'REDACT' } as IDecisionResult],
      ['cand_pdf_ssn', { candidateId: 'cand_pdf_ssn', decision: 'REDACT' } as IDecisionResult],
      ['cand_pdf_dob', { candidateId: 'cand_pdf_dob', decision: 'REDACT' } as IDecisionResult],
    ]);

    // Step 1: Run PdfEngine transformation
    const pdfEngine = new PdfEngine();
    const transformRes = await pdfEngine.transform({
      operation: 'REDACTION',
      candidates,
      decisions,
      mutationGenerator: mutationGen,
      sourceFilePath: sourcePdf,
      outputFilePath: transformedPdf,
    });

    expect(transformRes.transformedCount).toBe(3);
    expect(transformRes.failedCount).toBe(0);

    // Step 2: Run PdfSanitizerEngine for metadata & structural sanitization
    const pdfSanitizer = new PdfSanitizerEngine();
    await pdfSanitizer.sanitize({
      sourceFilePath: transformedPdf,
      outputFilePath: sanitizedPdf,
      filename: 'adversarial_sanitized.pdf',
      mimeType: 'application/pdf',
      extension: '.pdf',
      policyOptions: { stripAuthor: true, stripComments: true },
    });

    // ── ADVERSARIAL INSPECTION ──
    const outputBuffer = await fs.promises.readFile(sanitizedPdf);
    const outputBinary = outputBuffer.toString('binary');

    // Attack Check 1: Raw binary buffer search
    expect(outputBinary).not.toContain(sensitiveName);
    expect(outputBinary).not.toContain(sensitiveSSN);
    expect(outputBinary).not.toContain(sensitiveDob);

    // Attack Check 2: Decompressed stream inspection
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let sMatch: RegExpExecArray | null;
    let streamsChecked = 0;
    while ((sMatch = streamRegex.exec(outputBinary)) !== null) {
      streamsChecked++;
      try {
        const decompressed = zlib.inflateSync(Buffer.from(sMatch[1], 'binary')).toString('latin1');
        expect(decompressed).not.toContain(sensitiveName);
        expect(decompressed).not.toContain(sensitiveSSN);
        expect(decompressed).not.toContain(sensitiveDob);
      } catch {
        // Uncompressed stream
        expect(sMatch[1]).not.toContain(sensitiveName);
        expect(sMatch[1]).not.toContain(sensitiveSSN);
      }
    }
    expect(streamsChecked).toBeGreaterThan(0);

    // Attack Check 3: Metadata trailer dictionary inspection
    expect(outputBinary).not.toContain(`/Author (${sensitiveName})`);
  });

  // ── TEST 2: IMAGE (PNG) UNRECOVERABILITY PROOF ──────────────────────────────
  test('Image: Redacted pixels are physically destroyed with zero pixel data recovery possible', async () => {
    const sourcePngPath = path.join(scratchDir, 'adversarial_input.png');
    const outputPngPath = path.join(scratchDir, 'adversarial_redacted.png');

    // Create a real PNG image (50x50 pixels) with bright white text/pixels in the target region
    const width = 50;
    const height = 50;
    const initialPng = new PNG({ width, height });

    // Target sensitive region: [x=10, y=10, width=20, height=15]
    const targetBBox = { x: 10, y: 10, width: 20, height: 15 };

    // Fill background with grey, and target region with bright white (255, 255, 255)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        if (
          x >= targetBBox.x &&
          x < targetBBox.x + targetBBox.width &&
          y >= targetBBox.y &&
          y < targetBBox.y + targetBBox.height
        ) {
          initialPng.data[idx] = 255; // R
          initialPng.data[idx + 1] = 255; // G
          initialPng.data[idx + 2] = 255; // B
          initialPng.data[idx + 3] = 255; // A
        } else {
          initialPng.data[idx] = 128;
          initialPng.data[idx + 1] = 128;
          initialPng.data[idx + 2] = 128;
          initialPng.data[idx + 3] = 255;
        }
      }
    }

    await fs.promises.writeFile(sourcePngPath, PNG.sync.write(initialPng));

    // Candidates
    const candidates = [
      {
        candidateId: 'cand_img_secret',
        type: PIIType.AUTH_TOKEN_KEY,
        category: PIICategory.SECURITY_CREDENTIAL,
        text: 'AKIAIOSFODNN7EXAMPLE',
        location: {
          pageNumber: 1,
          boundingBox: targetBBox,
        },
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_img_secret', { candidateId: 'cand_img_secret', decision: 'REDACT' } as IDecisionResult],
    ]);

    // Execute ImageEngine
    const imageEngine = new ImageEngine();
    const result = await imageEngine.transform({
      operation: 'REDACTION',
      candidates,
      decisions,
      mutationGenerator: mutationGen,
      sourceFilePath: sourcePngPath,
      outputFilePath: outputPngPath,
    });

    expect(result.transformedCount).toBe(1);
    expect(result.failedCount).toBe(0);

    // ── ADVERSARIAL INSPECTION ──
    const outputPngBuffer = await fs.promises.readFile(outputPngPath);
    const decodedPng = PNG.sync.read(outputPngBuffer);

    // Assert that every single pixel in the target bounding box is now 0 (solid black)
    let nonBlackPixelsCount = 0;
    for (let y = targetBBox.y; y < targetBBox.y + targetBBox.height; y++) {
      for (let x = targetBBox.x; x < targetBBox.x + targetBBox.width; x++) {
        const idx = (decodedPng.width * y + x) << 2;
        const r = decodedPng.data[idx];
        const g = decodedPng.data[idx + 1];
        const b = decodedPng.data[idx + 2];
        const a = decodedPng.data[idx + 3];

        if (r !== 0 || g !== 0 || b !== 0 || a !== 255) {
          nonBlackPixelsCount++;
        }
      }
    }

    expect(nonBlackPixelsCount).toBe(0);

    // Assert text string does not exist in PNG chunks or raw bytes
    expect(outputPngBuffer.toString('utf8')).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  // ── TEST 3: OFFICE (DOCX) UNRECOVERABILITY PROOF ────────────────────────────
  test('DOCX: Cross-run split PII and thumbnails are completely eradicated', async () => {
    const sourceDocx = path.join(scratchDir, 'adversarial_input.docx');
    const transformedDocx = path.join(scratchDir, 'adversarial_transformed.docx');
    const sanitizedDocx = path.join(scratchDir, 'adversarial_sanitized.docx');

    const splitPan = 'ABCDE1234F';
    const splitCard = '4532 0151 1283 0366';
    const authorName = 'Alice Wonderland';

    // Construct a real DOCX archive where PII is split across multiple <w:r> runs
    const zip = new AdmZip();

    // Adversarially split PAN: "ABC" + "DE1" + "234F" across 3 runs with a spell error marker
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Tax Identification PAN: </w:t></w:r>
      <w:r><w:t>ABC</w:t></w:r>
      <w:proofErr w:type="spellStart"/>
      <w:r><w:t>DE1</w:t></w:r>
      <w:proofErr w:type="spellEnd"/>
      <w:r><w:t>234F</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Corporate Card: ${splitCard}</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

    const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>${authorName}</dc:creator>
  <cp:lastModifiedBy>${authorName}</cp:lastModifiedBy>
  <cp:revision>3</cp:revision>
</cp:coreProperties>`;

    zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf8'));
    zip.addFile('docProps/core.xml', Buffer.from(coreXml, 'utf8'));
    // Add thumbnail that could leak visual screenshot
    zip.addFile('docProps/thumbnail.emf', Buffer.from('FAKE_RENDERED_THUMBNAIL_SCREENSHOT_IMAGE_DATA'));

    await fs.promises.writeFile(sourceDocx, zip.toBuffer());

    const candidates = [
      {
        candidateId: 'cand_docx_pan',
        type: PIIType.INDIAN_PAN,
        category: PIICategory.GOVERNMENT_ID,
        text: splitPan,
        location: { pageNumber: 1 },
      } as unknown as IPIICandidate,
      {
        candidateId: 'cand_docx_card',
        type: PIIType.CREDIT_CARD_NUMBER,
        category: PIICategory.FINANCIAL_INFORMATION,
        text: splitCard,
        location: { pageNumber: 1 },
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_docx_pan', { candidateId: 'cand_docx_pan', decision: 'REDACT' } as IDecisionResult],
      ['cand_docx_card', { candidateId: 'cand_docx_card', decision: 'REDACT' } as IDecisionResult],
    ]);

    // Step 1: Run DocxEngine transformation
    const docxEngine = new DocxEngine();
    const transformRes = await docxEngine.transform({
      operation: 'REDACTION',
      candidates,
      decisions,
      mutationGenerator: mutationGen,
      sourceFilePath: sourceDocx,
      outputFilePath: transformedDocx,
    });

    expect(transformRes.transformedCount).toBe(2);
    expect(transformRes.failedCount).toBe(0);

    // Step 2: Run DocxSanitizerEngine
    const docxSanitizer = new DocxSanitizerEngine();
    await docxSanitizer.sanitize({
      sourceFilePath: transformedDocx,
      outputFilePath: sanitizedDocx,
      filename: 'adversarial_sanitized.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: '.docx',
      policyOptions: { stripAuthor: true, stripComments: true },
    });

    // ── ADVERSARIAL INSPECTION ──
    const outputZip = new AdmZip(sanitizedDocx);
    const outputEntries = outputZip.getEntries();

    let allExtractedText = '';
    for (const entry of outputEntries) {
      if (entry.entryName.endsWith('.xml')) {
        const xml = entry.getData().toString('utf8');
        allExtractedText += ' ' + xml;
        // Strip XML tags and check plain text
        const plain = xml.replace(/<[^>]+>/g, '');
        allExtractedText += ' ' + plain;
      }
    }

    // Attack Check 1: Split PAN must NOT be reconstructible or present
    expect(allExtractedText).not.toContain(splitPan);
    expect(allExtractedText).not.toContain('ABCDE1234F');

    // Attack Check 2: Card number must NOT be present
    expect(allExtractedText).not.toContain(splitCard);

    // Attack Check 3: Metadata author must be sanitized
    expect(allExtractedText).not.toContain(authorName);

    // Attack Check 4: Thumbnail preview must be deleted
    const hasThumbnail = outputEntries.some((e) => e.entryName.includes('thumbnail'));
    expect(hasThumbnail).toBe(false);
  });
});
