import { TransformationVerifier } from '../../src/services/verification/verifiers/transformationVerifier';

describe('TransformationVerifier — Decision-Aware Transformation Matrix Unit Tests', () => {
  const srcChecksum = '1111111111111111111111111111111111111111111111111111111111111111';
  const outChecksum = '2222222222222222222222222222222222222222222222222222222222222222';

  test('REDACT + correctly transformed and clean -> PASS', () => {
    const res = TransformationVerifier.verify({
      transformationRunExists: true,
      operationType: 'REDACT',
      sourceChecksum: srcChecksum,
      outputChecksum: outChecksum,
      residualProhibitedContentObserved: false,
    });
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });

  test('REDACT + un-mutated (source === output checksum) -> FAIL', () => {
    const res = TransformationVerifier.verify({
      transformationRunExists: true,
      operationType: 'REDACT',
      sourceChecksum: srcChecksum,
      outputChecksum: srcChecksum,
    });
    expect(res.passed).toBe(false);
    expect(res.reasonCode).toBe('UNTRANSFORMED_REDACTION_OUTPUT');
  });

  test('REDACT + mutated BUT prohibited content survives -> FAIL', () => {
    const res = TransformationVerifier.verify({
      transformationRunExists: true,
      operationType: 'REDACT',
      sourceChecksum: srcChecksum,
      outputChecksum: outChecksum,
      residualProhibitedContentObserved: true,
    });
    expect(res.passed).toBe(false);
    expect(res.reasonCode).toBe('PROHIBITED_CONTENT_SURVIVES_TRANSFORMATION');
  });

  test('KEEP + unchanged -> PASS', () => {
    const res = TransformationVerifier.verify({
      transformationRunExists: false,
      operationType: 'KEEP',
      sourceChecksum: srcChecksum,
      outputChecksum: srcChecksum,
    });
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });

  test('REVIEW + valid review state -> PASS / PARTIAL', () => {
    const res = TransformationVerifier.verify({
      transformationRunExists: false,
      operationType: 'REVIEW',
      sourceChecksum: srcChecksum,
      outputChecksum: srcChecksum,
      isPublishedAsSanitized: false,
    });
    expect(res.passed).toBe(true);
    expect(res.status).toBe('PARTIAL');
  });

  test('REVIEW + falsely published as sanitized -> FAIL', () => {
    const res = TransformationVerifier.verify({
      transformationRunExists: false,
      operationType: 'REVIEW',
      sourceChecksum: srcChecksum,
      outputChecksum: outChecksum,
      isPublishedAsSanitized: true,
    });
    expect(res.passed).toBe(false);
    expect(res.reasonCode).toBe('REVIEW_ARTIFACT_FALSELY_SANITIZED');
  });
});
