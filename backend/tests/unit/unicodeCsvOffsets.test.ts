import fs from 'fs';
import path from 'path';
import { TextEngine } from '../../src/services/transformation/engines/text.engine';
import { MutationGenerator } from '../../src/services/transformation/mutationGenerator';
import { IPIICandidate } from '../../src/models/piiCandidate.model';
import { IDecisionResult } from '../../src/models/decisionResult.model';
import { PIIType, PIICategory } from '../../src/config/piiTaxonomy';

describe('Plaintext / CSV Unicode & Offset Unit Tests', () => {
  const scratchDir = path.join(process.cwd(), 'scratch', 'test_unicode_offsets');

  beforeAll(async () => {
    await fs.promises.mkdir(scratchDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  });

  const mutationGen = new MutationGenerator({
    transformationRunId: 'trans_unicode_1',
    seed: 'seed_unicode_1',
  });

  test('handles Tamil and Hindi Indic PII text correctly', async () => {
    const sourceFile = path.join(scratchDir, 'indic_source.txt');
    const outputFile = path.join(scratchDir, 'indic_redacted.txt');
    const content = 'பெயர்: அருள் செல்வன், नाम: अमित शर्मा.';
    await fs.promises.writeFile(sourceFile, content, 'utf8');

    const candidates = [
      {
        candidateId: 'cand_tamil_1',
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: 'அருள் செல்வன்',
        location: { startOffset: 7, endOffset: 20 },
      } as unknown as IPIICandidate,
      {
        candidateId: 'cand_hindi_1',
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: 'अमित शर्मा',
        location: { startOffset: 28, endOffset: 38 },
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_tamil_1', { candidateId: 'cand_tamil_1', decision: 'REDACT' } as IDecisionResult],
      ['cand_hindi_1', { candidateId: 'cand_hindi_1', decision: 'REDACT' } as IDecisionResult],
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

    const outText = await fs.promises.readFile(outputFile, 'utf8');
    expect(outText).not.toContain('அருள் செல்வன்');
    expect(outText).not.toContain('अमित शर्मा');
  });

  test('handles CRLF line endings and CSV quoted values', async () => {
    const sourceFile = path.join(scratchDir, 'sample_crlf.csv');
    const outputFile = path.join(scratchDir, 'sample_crlf_redacted.csv');
    const content = 'id,name,email\r\n1,"Smith, John",john.smith@example.com\r\n2,"Doe, Jane",jane.doe@example.com';
    await fs.promises.writeFile(sourceFile, content, 'utf8');

    const candidates = [
      {
        candidateId: 'cand_csv_1',
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: 'Smith, John',
        location: { startOffset: 17, endOffset: 28 },
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_csv_1', { candidateId: 'cand_csv_1', decision: 'REDACT' } as IDecisionResult],
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

    expect(result.transformedCount).toBe(1);

    const outText = await fs.promises.readFile(outputFile, 'utf8');
    expect(outText).not.toContain('Smith, John');
    expect(outText).toContain('\r\n');
  });
});
