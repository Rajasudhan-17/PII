import { PolicyVerifier } from '../../src/services/verification/verifiers/policyVerifier';

describe('PolicyVerifier — KEEP Semantic Verification Unit Tests', () => {
  const srcChecksum = 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123';
  const outChecksum = 'f6e5d4c3b2a10123456789abcdef0123456789abcdef0123456789abcdef0123';

  test('KEEP decision with identical source and output checksum passes policy verification', () => {
    const res = PolicyVerifier.verify('KEEP', srcChecksum, srcChecksum, false, false, false);
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
    expect(res.reasonCode).toBe('POLICY_VERIFIED');
    expect(res.expected).toBe('UNMODIFIED_OR_AUTHORIZED_KEEP');
  });

  test('KEEP decision with modified checksum BUT no unauthorized mutation passes with warning', () => {
    const res = PolicyVerifier.verify('KEEP', srcChecksum, outChecksum, false, false, false);
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  test('KEEP decision with unauthorized mutation fails policy verification', () => {
    const res = PolicyVerifier.verify('KEEP', srcChecksum, outChecksum, false, true, false);
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAILED');
    expect(res.reasonCode).toBe('UNAUTHORIZED_MUTATION_OBSERVED');
  });
});
