import { ChecksumVerifier } from '../../src/services/verification/verifiers/checksumVerifier';
import { PolicyVerifier } from '../../src/services/verification/verifiers/policyVerifier';
import { TransformationVerifier } from '../../src/services/verification/verifiers/transformationVerifier';
import { sanitizationService } from '../../src/services/sanitization/sanitization.service';
import { transformationService } from '../../src/services/transformation/transformation.service';

describe('Verifier Independence Unit Tests — Independence from Upstream Engines', () => {
  test('Phase 13 verifiers operate independently without invoking SanitizationService or TransformationService methods', async () => {
    const sanitSpy = jest.spyOn(sanitizationService, 'executeSanitization').mockImplementation(async () => {
      throw new Error('Phase 13 should NOT delegate to SanitizationService');
    });

    const transSpy = jest.spyOn(transformationService, 'executeTransformation').mockImplementation(async () => {
      throw new Error('Phase 13 should NOT delegate to TransformationService');
    });

    const srcChecksum = '1111111111111111111111111111111111111111111111111111111111111111';
    const outChecksum = '2222222222222222222222222222222222222222222222222222222222222222';

    const policyRes = PolicyVerifier.verify('REDACT', srcChecksum, outChecksum, false, false, false);
    expect(policyRes.passed).toBe(true);

    const transRes = TransformationVerifier.verify({
      transformationRunExists: true,
      operationType: 'REDACT',
      sourceChecksum: srcChecksum,
      outputChecksum: outChecksum,
      residualProhibitedContentObserved: false,
    });
    expect(transRes.passed).toBe(true);

    const checkRes = ChecksumVerifier.verify('dummy_src', 'dummy_out', srcChecksum, outChecksum);
    expect(checkRes).toBeDefined();

    expect(sanitSpy).not.toHaveBeenCalled();
    expect(transSpy).not.toHaveBeenCalled();

    sanitSpy.mockRestore();
    transSpy.mockRestore();
  });
});
