import fs from 'fs';
import path from 'path';
import { TransformationEngineFactory } from '../../src/services/transformation/engines/engine.factory';
import { TextEngine } from '../../src/services/transformation/engines/text.engine';
import { PdfEngine } from '../../src/services/transformation/engines/pdf.engine';
import { DocxEngine } from '../../src/services/transformation/engines/docx.engine';
import { XlsxEngine } from '../../src/services/transformation/engines/xlsx.engine';
import { ImageEngine } from '../../src/services/transformation/engines/image.engine';
import { MutationGenerator } from '../../src/services/transformation/mutationGenerator';
import { IPIICandidate } from '../../src/models/piiCandidate.model';
import { IDecisionResult } from '../../src/models/decisionResult.model';
import { PIIType, PIICategory } from '../../src/config/piiTaxonomy';

describe('Transformation Engines Unit Tests', () => {
  const scratchDir = path.join(process.cwd(), 'scratch', 'test_engines');

  beforeAll(async () => {
    await fs.promises.mkdir(scratchDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('TransformationEngineFactory', () => {
    test('returns PdfEngine for pdf extension or mime type', () => {
      expect(TransformationEngineFactory.getEngine('pdf', 'application/pdf')).toBeInstanceOf(PdfEngine);
    });

    test('returns DocxEngine for docx extension or wordprocessingml mime type', () => {
      expect(TransformationEngineFactory.getEngine('docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeInstanceOf(DocxEngine);
    });

    test('returns XlsxEngine for xlsx extension or spreadsheetml mime type', () => {
      expect(TransformationEngineFactory.getEngine('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBeInstanceOf(XlsxEngine);
    });

    test('returns TextEngine for txt/csv/log', () => {
      expect(TransformationEngineFactory.getEngine('txt', 'text/plain')).toBeInstanceOf(TextEngine);
      expect(TransformationEngineFactory.getEngine('csv', 'text/csv')).toBeInstanceOf(TextEngine);
    });

    test('returns ImageEngine for png/jpg/jpeg', () => {
      expect(TransformationEngineFactory.getEngine('png', 'image/png')).toBeInstanceOf(ImageEngine);
      expect(TransformationEngineFactory.getEngine('jpg', 'image/jpeg')).toBeInstanceOf(ImageEngine);
    });
  });

  describe('TextEngine', () => {
    const mutationGen = new MutationGenerator({
      transformationRunId: 'trans_text_1',
      seed: 'seed_text_1',
    });

    test('redacts text in REDACTION mode replacing with visual blocks', async () => {
      const sourceFile = path.join(scratchDir, 'sample_source.txt');
      const outputFile = path.join(scratchDir, 'sample_redacted.txt');
      const content = 'User name is John Smith and email is john@example.com.';
      await fs.promises.writeFile(sourceFile, content, 'utf8');

      const candidates = [
        {
          candidateId: 'cand_1',
          type: PIIType.PERSON_NAME,
          category: PIICategory.DIRECT_IDENTIFIER,
          text: 'John Smith',
          location: { startOffset: 13, endOffset: 23 },
        } as unknown as IPIICandidate,
        {
          candidateId: 'cand_2',
          type: PIIType.EMAIL_ADDRESS,
          category: PIICategory.CONTACT_INFORMATION,
          text: 'john@example.com',
          location: { startOffset: 37, endOffset: 53 },
        } as unknown as IPIICandidate,
      ];

      const decisions = new Map<string, IDecisionResult>([
        ['cand_1', { candidateId: 'cand_1', decision: 'REDACT' } as IDecisionResult],
        ['cand_2', { candidateId: 'cand_2', decision: 'REDACT' } as IDecisionResult],
      ]);

      const engine = new TextEngine();
      const result = await engine.transform({
        operation: 'REDACTION',
        candidates,
        decisions,
        mutationGenerator: mutationGen,
        sourceFilePath: sourceFile,
        outputFilePath: outputFile,
      });

      expect(result.transformedCount).toBe(2);
      expect(result.failedCount).toBe(0);

      const transformedContent = await fs.promises.readFile(outputFile, 'utf8');
      expect(transformedContent).not.toContain('John Smith');
      expect(transformedContent).not.toContain('john@example.com');
      expect(transformedContent).toContain('█');
    });

    test('mutates text in MUTATION mode replacing with synthetic values', async () => {
      const sourceFile = path.join(scratchDir, 'sample_mutate_source.txt');
      const outputFile = path.join(scratchDir, 'sample_mutated.txt');
      const content = 'Contact Alice Doe at alice@test.com.';
      await fs.promises.writeFile(sourceFile, content, 'utf8');

      const candidates = [
        {
          candidateId: 'cand_10',
          type: PIIType.PERSON_NAME,
          category: PIICategory.DIRECT_IDENTIFIER,
          text: 'Alice Doe',
          location: { startOffset: 8, endOffset: 17 },
        } as unknown as IPIICandidate,
        {
          candidateId: 'cand_11',
          type: PIIType.EMAIL_ADDRESS,
          category: PIICategory.CONTACT_INFORMATION,
          text: 'alice@test.com',
          location: { startOffset: 21, endOffset: 35 },
        } as unknown as IPIICandidate,
      ];

      const decisions = new Map<string, IDecisionResult>([
        ['cand_10', { candidateId: 'cand_10', decision: 'REDACT' } as IDecisionResult],
        ['cand_11', { candidateId: 'cand_11', decision: 'REDACT' } as IDecisionResult],
      ]);

      const engine = new TextEngine();
      const result = await engine.transform({
        operation: 'MUTATION',
        candidates,
        decisions,
        mutationGenerator: mutationGen,
        sourceFilePath: sourceFile,
        outputFilePath: outputFile,
      });

      expect(result.transformedCount).toBe(2);

      const transformedContent = await fs.promises.readFile(outputFile, 'utf8');
      expect(transformedContent).not.toContain('Alice Doe');
      expect(transformedContent).not.toContain('alice@test.com');
      expect(transformedContent).toContain('@example.invalid');
    });

    test('skips candidates with KEEP or REVIEW decision', async () => {
      const sourceFile = path.join(scratchDir, 'sample_keep_source.txt');
      const outputFile = path.join(scratchDir, 'sample_keep_out.txt');
      const content = 'City is New York, name is Bob Smith.';
      await fs.promises.writeFile(sourceFile, content, 'utf8');

      const candidates = [
        {
          candidateId: 'cand_20',
          type: PIIType.CITY,
          category: PIICategory.LOCATION_DATA,
          text: 'New York',
          location: { startOffset: 8, endOffset: 16 },
        } as unknown as IPIICandidate,
        {
          candidateId: 'cand_21',
          type: PIIType.PERSON_NAME,
          category: PIICategory.DIRECT_IDENTIFIER,
          text: 'Bob Smith',
          location: { startOffset: 27, endOffset: 36 },
        } as unknown as IPIICandidate,
      ];

      const decisions = new Map<string, IDecisionResult>([
        ['cand_20', { candidateId: 'cand_20', decision: 'KEEP' } as IDecisionResult],
        ['cand_21', { candidateId: 'cand_21', decision: 'REVIEW' } as IDecisionResult],
      ]);

      const engine = new TextEngine();
      const result = await engine.transform({
        operation: 'REDACTION',
        candidates,
        decisions,
        mutationGenerator: mutationGen,
        sourceFilePath: sourceFile,
        outputFilePath: outputFile,
      });

      expect(result.transformedCount).toBe(0);
      expect(result.skippedCount).toBe(2);

      const transformedContent = await fs.promises.readFile(outputFile, 'utf8');
      expect(transformedContent).toBe(content);
    });
  });

  describe('PdfEngine', () => {
    const mutationGen = new MutationGenerator({
      transformationRunId: 'trans_pdf_1',
      seed: 'seed_pdf_1',
    });

    test('replaces stream text and verifies original text absence', async () => {
      const sourceFile = path.join(scratchDir, 'sample_source.pdf');
      const outputFile = path.join(scratchDir, 'sample_redacted.pdf');
      const rawPdfContent = '%PDF-1.4 1 0 obj << >> stream (Secret SSN 123-45-6789) endstream endobj';
      await fs.promises.writeFile(sourceFile, rawPdfContent, 'binary');

      const candidates = [
        {
          candidateId: 'cand_pdf_1',
          type: PIIType.US_SSN,
          category: PIICategory.GOVERNMENT_ID,
          text: '123-45-6789',
          location: { pageNumber: 1 },
        } as unknown as IPIICandidate,
      ];

      const decisions = new Map<string, IDecisionResult>([
        ['cand_pdf_1', { candidateId: 'cand_pdf_1', decision: 'REDACT' } as IDecisionResult],
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
      expect(result.warnings.length).toBe(0);

      const outBuffer = await fs.promises.readFile(outputFile, 'binary');
      expect(outBuffer).not.toContain('123-45-6789');
    });
  });
});
