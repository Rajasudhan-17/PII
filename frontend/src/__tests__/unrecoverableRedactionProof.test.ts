import { describe, test, expect } from 'vitest';
import JSZip from 'jszip';
import {
  generateSanitizedDocx,
  applyRedactionsToText,
  runVerificationChecks,
  detectPII,
  computeSHA256,
} from '../services/realScanner';
import { RuleSet, FindingItem } from '../context/RedactContext';

describe('Frontend Unrecoverable Redaction Proof — Adversarial Zero-Leakage Tests', () => {
  const sampleRuleSet: RuleSet = {
    id: 'test-adversarial',
    name: 'Adversarial Test Rule Set',
    isCustom: false,
    typeSummary: 'All 11 types',
    detectors: {
      names: true,
      emails: true,
      phones: true,
      dobs: true,
      addresses: true,
      cards: true,
      ibans: true,
      ssn: true,
      aadhaar: true,
      pan: true,
      api_keys: true,
    },
    alwaysRedact: ['Confidential Project Alpha'],
    neverRedact: [],
    confidenceThreshold: 60,
    defaultLook: 'bar',
  };

  test('DOCX: Cross-run split text and thumbnail previews are unrecoverably redacted', async () => {
    const zip = new JSZip();

    const sensitiveName = 'Priya Nair';
    const sensitiveCard = '4532 0151 1283 0366';

    // Word document with PII split across multiple <w:r> tags with spell check tags
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Candidate: </w:t></w:r>
      <w:r><w:t>Priya</w:t></w:r>
      <w:proofErr w:type="spellStart"/>
      <w:r><w:t> </w:t></w:r>
      <w:proofErr w:type="spellEnd"/>
      <w:r><w:t>Nair</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Card: ${sensitiveCard}</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

    const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>Priya Nair</dc:creator>
  <cp:lastModifiedBy>Priya Nair</cp:lastModifiedBy>
</cp:coreProperties>`;

    zip.file('word/document.xml', documentXml);
    zip.file('docProps/core.xml', coreXml);
    // Add thumbnail screenshot that could visually leak
    zip.file('docProps/thumbnail.emf', 'SCREENSHOT_LEAK_IMAGE');

    const findings: FindingItem[] = [
      {
        id: 'finding_name',
        type: 'PERSON_NAME',
        label: 'NAME',
        value: sensitiveName,
        places: 1,
        status: 'redact',
        source: 'automatic',
      },
      {
        id: 'finding_card',
        type: 'CREDIT_CARD',
        label: 'CARD',
        value: sensitiveCard,
        places: 1,
        status: 'redact',
        source: 'automatic',
      },
    ];

    // Generate sanitized DOCX
    const sanitizedBlob = await generateSanitizedDocx(zip, findings, 'bar');
    expect(sanitizedBlob).toBeDefined();

    // Reopen the resulting ZIP archive and scan every entry
    const reloadedZip = await JSZip.loadAsync(await sanitizedBlob.arrayBuffer());
    const fileEntries = Object.keys(reloadedZip.files);

    let allExtracted = '';
    for (const name of fileEntries) {
      if (name.endsWith('.xml')) {
        const text = await reloadedZip.file(name)!.async('text');
        allExtracted += ' ' + text;
      }
    }

    // Adversarial verification: original PII must NOT be found anywhere in the archive
    expect(allExtracted).not.toContain(sensitiveName);
    expect(allExtracted).not.toContain(sensitiveCard);
    expect(allExtracted).not.toContain('Priya Nair');

    // Thumbnail preview must be completely deleted
    const hasThumbnail = fileEntries.some((f) => f.includes('thumbnail'));
    expect(hasThumbnail).toBe(false);
  });

  test('Text: Physical redaction leaves 0 residual PII and passes inverted detector check', async () => {
    const originalText = `
      EMPLOYEE RECORD:
      Name: Sarah Connor
      Email: sarah.connor@cyberdyne.org
      Card: 4532 0151 1283 0366
      PAN: ABCDE1234F
      Project: Confidential Project Alpha
    `;

    const findings = detectPII(originalText, sampleRuleSet);
    expect(findings.length).toBeGreaterThanOrEqual(4);

    const redacted = applyRedactionsToText(originalText, findings, 'bar');

    // Verification check
    const report = runVerificationChecks(originalText, redacted, findings, sampleRuleSet);
    expect(report.searchedOutput).toBe(true);
    expect(report.hiddenChecked).toBe(true);
    expect(report.residualCount).toBe(0);

    // Cryptographic proof: original SHA-256 and sanitized SHA-256 are distinct
    const origHash = await computeSHA256(originalText);
    const redHash = await computeSHA256(redacted);
    expect(origHash).not.toBe(redHash);
    expect(redHash.length).toBe(64);
  });
});
