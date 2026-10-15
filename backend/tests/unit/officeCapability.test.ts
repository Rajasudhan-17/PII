import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { DocxEngine } from '../../src/services/transformation/engines/docx.engine';
import { XlsxEngine } from '../../src/services/transformation/engines/xlsx.engine';
import { MutationGenerator } from '../../src/services/transformation/mutationGenerator';
import { IPIICandidate } from '../../src/models/piiCandidate.model';
import { IDecisionResult } from '../../src/models/decisionResult.model';
import { PIIType, PIICategory } from '../../src/config/piiTaxonomy';

describe('Office Document Capability Audit Unit Tests', () => {
  const scratchDir = path.join(process.cwd(), 'scratch', 'test_office_capability');

  beforeAll(async () => {
    await fs.promises.mkdir(scratchDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  });

  const mutationGen = new MutationGenerator({
    transformationRunId: 'trans_office_1',
    seed: 'seed_office_1',
  });

  test('DOCX: transforms text in headers, footers, and main document.xml streams', async () => {
    const docxFile = path.join(scratchDir, 'sample_doc.docx');
    const outputFile = path.join(scratchDir, 'sample_doc_redacted.docx');

    const zip = new AdmZip();
    zip.addFile('word/document.xml', Buffer.from('<w:document><w:body><w:p><w:t>Alice Smith</w:t></w:p></w:body></w:document>', 'utf8'));
    zip.addFile('word/header1.xml', Buffer.from('<w:hdr><w:p><w:t>Header Alice Smith</w:t></w:p></w:hdr>', 'utf8'));
    zip.writeZip(docxFile);

    const candidates = [
      {
        candidateId: 'cand_docx_1',
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: 'Alice Smith',
        location: {},
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_docx_1', { candidateId: 'cand_docx_1', decision: 'REDACT' } as IDecisionResult],
    ]);

    const engine = new DocxEngine();
    const result = await engine.transform({
      operation: 'REDACTION',
      candidates,
      decisions,
      mutationGenerator: mutationGen,
      sourceFilePath: docxFile,
      outputFilePath: outputFile,
    });

    expect(result.transformedCount).toBe(1);
    expect(result.failedCount).toBe(0);

    const outZip = new AdmZip(outputFile);
    const docXml = outZip.readAsText('word/document.xml');
    const hdrXml = outZip.readAsText('word/header1.xml');
    expect(docXml).not.toContain('Alice Smith');
    expect(hdrXml).not.toContain('Alice Smith');
  });

  test('XLSX: transforms text in sharedStrings.xml and sheet XML entries', async () => {
    const xlsxFile = path.join(scratchDir, 'sample_sheet.xlsx');
    const outputFile = path.join(scratchDir, 'sample_sheet_redacted.xlsx');

    const zip = new AdmZip();
    zip.addFile('xl/sharedStrings.xml', Buffer.from('<sst><si><t>Bob Jones</t></si></sst>', 'utf8'));
    zip.addFile('xl/worksheets/sheet1.xml', Buffer.from('<worksheet><sheetData><row><c t="s"><v>0</v></c></row></sheetData></worksheet>', 'utf8'));
    zip.writeZip(xlsxFile);

    const candidates = [
      {
        candidateId: 'cand_xlsx_1',
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: 'Bob Jones',
        location: {},
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_xlsx_1', { candidateId: 'cand_xlsx_1', decision: 'REDACT' } as IDecisionResult],
    ]);

    const engine = new XlsxEngine();
    const result = await engine.transform({
      operation: 'REDACTION',
      candidates,
      decisions,
      mutationGenerator: mutationGen,
      sourceFilePath: xlsxFile,
      outputFilePath: outputFile,
    });

    expect(result.transformedCount).toBe(1);
    const outZip = new AdmZip(outputFile);
    const sharedXml = outZip.readAsText('xl/sharedStrings.xml');
    expect(sharedXml).not.toContain('Bob Jones');
  });
});
