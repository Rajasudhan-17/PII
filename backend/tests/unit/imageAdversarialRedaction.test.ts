import fs from 'fs';
import path from 'path';
import { ImageEngine } from '../../src/services/transformation/engines/image.engine';
import { MutationGenerator } from '../../src/services/transformation/mutationGenerator';
import { IPIICandidate } from '../../src/models/piiCandidate.model';
import { IDecisionResult } from '../../src/models/decisionResult.model';
import { PIIType, PIICategory } from '../../src/config/piiTaxonomy';

describe('Image / OCR / HTR Adversarial Redaction Unit Tests', () => {
  const scratchDir = path.join(process.cwd(), 'scratch', 'test_image_adversarial');

  beforeAll(async () => {
    await fs.promises.mkdir(scratchDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  });

  const mutationGen = new MutationGenerator({
    transformationRunId: 'trans_img_adv_1',
    seed: 'seed_img_adv_1',
  });

  test('validates exact bounding box coordinates and transforms region', async () => {
    const sourceFile = path.join(scratchDir, 'sample_ocr.png');
    const outputFile = path.join(scratchDir, 'sample_ocr_out.png');
    await fs.promises.writeFile(sourceFile, Buffer.from('FAKE_PNG_HEADER_PIXELS_DATA_12345'), 'binary');

    const candidates = [
      {
        candidateId: 'cand_img_1',
        type: PIIType.PERSON_NAME,
        category: PIICategory.DIRECT_IDENTIFIER,
        text: 'John Smith',
        location: {
          pageNumber: 1,
          boundingBox: { x: 10, y: 20, width: 100, height: 30 },
        },
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_img_1', { candidateId: 'cand_img_1', decision: 'REDACT' } as IDecisionResult],
    ]);

    const engine = new ImageEngine();
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
    expect(result.appliedRecords[0].status).toBe('APPLIED');
  });

  test('rejects negative or zero-width/height bounding box coordinates safely', async () => {
    const sourceFile = path.join(scratchDir, 'sample_bad_ocr.png');
    const outputFile = path.join(scratchDir, 'sample_bad_ocr_out.png');
    await fs.promises.writeFile(sourceFile, Buffer.from('FAKE_PNG_HEADER_PIXELS_DATA_67890'), 'binary');

    const candidates = [
      {
        candidateId: 'cand_img_neg',
        type: PIIType.US_SSN,
        category: PIICategory.GOVERNMENT_ID,
        text: '999-00-1111',
        location: {
          pageNumber: 1,
          boundingBox: { x: -5, y: 10, width: 50, height: 20 },
        },
      } as unknown as IPIICandidate,
      {
        candidateId: 'cand_img_zero',
        type: PIIType.PHONE_NUMBER,
        category: PIICategory.CONTACT_INFORMATION,
        text: '555-1234',
        location: {
          pageNumber: 1,
          boundingBox: { x: 10, y: 10, width: 0, height: 20 },
        },
      } as unknown as IPIICandidate,
    ];

    const decisions = new Map<string, IDecisionResult>([
      ['cand_img_neg', { candidateId: 'cand_img_neg', decision: 'REDACT' } as IDecisionResult],
      ['cand_img_zero', { candidateId: 'cand_img_zero', decision: 'REDACT' } as IDecisionResult],
    ]);

    const engine = new ImageEngine();
    const result = await engine.transform({
      operation: 'REDACTION',
      candidates,
      decisions,
      mutationGenerator: mutationGen,
      sourceFilePath: sourceFile,
      outputFilePath: outputFile,
    });

    expect(result.transformedCount).toBe(0);
    expect(result.failedCount).toBe(2);
    expect(result.appliedRecords[0].failureReason).toBe('INVALID_BOUNDING_BOX_COORDINATES');
    expect(result.appliedRecords[1].failureReason).toBe('INVALID_BOUNDING_BOX_COORDINATES');
  });
});
