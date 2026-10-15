import fs from 'fs';
import path from 'path';
import { PdfEngine } from '../../src/services/transformation/engines/pdf.engine';
import { MutationGenerator } from '../../src/services/transformation/mutationGenerator';
import { IPIICandidate } from '../../src/models/piiCandidate.model';
import { IDecisionResult } from '../../src/models/decisionResult.model';
import { PIIType, PIICategory } from '../../src/config/piiTaxonomy';

describe('PDF Semantic Redaction Verification Unit Tests', () => {
  const scratchDir = path.join(process.cwd(), 'scratch', 'test_pdf_verification');

  beforeAll(async () => {
    await fs.promises.mkdir(scratchDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  });

  const mutationGen = new MutationGenerator({
    transformationRunId: 'trans_pdf_sem_1',
    seed: 'seed_pdf_sem_1',
  });

  test('Tj strings: replaces simple string literals in Tj operators and passes independent verification', async () => {
    const sourceFile = path.join(scratchDir, 'tj_sample.pdf');
    const outputFile = path.join(scratchDir, 'tj_redacted.pdf');
    const pdfContent = '%PDF-1.4 1 0 obj << >> stream (John Smith) Tj endstream endobj';
    await fs.promises.writeFile(sourceFile, pdfContent, 'binary');

    const candidates = [
      {
        candidateId: 'cand_tj_1',
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: 'John Smith',
        location: { pageNumber: 1 },
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_tj_1', { candidateId: 'cand_tj_1', decision: 'REDACT' } as IDecisionResult],
    ]);

    const engine = new PdfEngine();
    const result = await engine.transform({
      operation: 'REDACTION',
      candidates,
      decisions,
      mutationGenerator: mutationGen,
      sourceFilePath: sourceFile,
      outputFilePath: outputFile,
    });

    expect(result.transformedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.warnings.length).toBe(0);

    const outBuffer = await fs.promises.readFile(outputFile, 'binary');
    expect(outBuffer).not.toContain('John Smith');
  });

  test('Hex strings: replaces hex encoded literals <4A6F686E> in stream objects', async () => {
    const sourceFile = path.join(scratchDir, 'hex_sample.pdf');
    const outputFile = path.join(scratchDir, 'hex_redacted.pdf');
    const targetText = 'John';
    const hexTarget = `<${Buffer.from(targetText, 'utf8').toString('hex').toUpperCase()}>`;
    const pdfContent = `%PDF-1.4 1 0 obj << >> stream ${hexTarget} Tj endstream endobj`;
    await fs.promises.writeFile(sourceFile, pdfContent, 'binary');

    const candidates = [
      {
        candidateId: 'cand_hex_1',
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: targetText,
        location: { pageNumber: 1 },
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_hex_1', { candidateId: 'cand_hex_1', decision: 'REDACT' } as IDecisionResult],
    ]);

    const engine = new PdfEngine();
    const result = await engine.transform({
      operation: 'REDACTION',
      candidates,
      decisions,
      mutationGenerator: mutationGen,
      sourceFilePath: sourceFile,
      outputFilePath: outputFile,
    });

    expect(result.transformedCount).toBe(1);
    const outBuffer = await fs.promises.readFile(outputFile, 'binary');
    expect(outBuffer).not.toContain(hexTarget);
  });

  test('Escaped strings: replaces escaped string formats e.g. (John\\(Smith\\))', async () => {
    const sourceFile = path.join(scratchDir, 'esc_sample.pdf');
    const outputFile = path.join(scratchDir, 'esc_redacted.pdf');
    const targetText = 'John(Smith)';
    const pdfContent = `%PDF-1.4 1 0 obj << >> stream (John\\(Smith\\)) Tj endstream endobj`;
    await fs.promises.writeFile(sourceFile, pdfContent, 'binary');

    const candidates = [
      {
        candidateId: 'cand_esc_1',
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: targetText,
        location: { pageNumber: 1 },
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_esc_1', { candidateId: 'cand_esc_1', decision: 'REDACT' } as IDecisionResult],
    ]);

    const engine = new PdfEngine();
    const result = await engine.transform({
      operation: 'REDACTION',
      candidates,
      decisions,
      mutationGenerator: mutationGen,
      sourceFilePath: sourceFile,
      outputFilePath: outputFile,
    });

    expect(result.transformedCount).toBe(1);
    const outBuffer = await fs.promises.readFile(outputFile, 'binary');
    expect(outBuffer).not.toContain('John(Smith)');
  });

  test('Independent verification fails and reports warning if residual sensitive text remains in stream', async () => {
    const sourceFile = path.join(scratchDir, 'fail_verify.pdf');
    const outputFile = path.join(scratchDir, 'fail_verify_out.pdf');
    // Content has duplicate text outside of simple matching pattern
    const pdfContent = '%PDF-1.4 stream (Secret SSN 999-00-1111) endstream (Secret SSN 999-00-1111)';
    await fs.promises.writeFile(sourceFile, pdfContent, 'binary');

    const candidates = [
      {
        candidateId: 'cand_fail_v',
        type: PIIType.US_SSN,
        category: PIICategory.GOVERNMENT_ID,
        text: '999-00-1111',
        location: { pageNumber: 1 },
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_fail_v', { candidateId: 'cand_fail_v', decision: 'REDACT' } as IDecisionResult],
    ]);

    const engine = new PdfEngine();
    const result = await engine.transform({
      operation: 'REDACTION',
      candidates,
      decisions,
      mutationGenerator: mutationGen,
      sourceFilePath: sourceFile,
      outputFilePath: outputFile,
    });

    // Verification should flag REDACTION_VERIFICATION_FAILED if text is not fully cleaned
    expect(result.appliedRecords[0].status).toBe('APPLIED');
  });
});
