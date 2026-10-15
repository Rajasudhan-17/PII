import { PolicyVerifier } from '../../src/services/verification/verifiers/policyVerifier';

describe('PolicyVerifier — REDACT Semantic Verification Unit Tests', () => {
  const srcChecksum = 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123';
  const outChecksum = 'f6e5d4c3b2a10123456789abcdef0123456789abcdef0123456789abcdef0123';

  test('REDACT decision with identical source and output checksums fails policy verification', () => {
    const res = PolicyVerifier.verify('REDACT', srcChecksum, srcChecksum, false, false, false);
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAILED');
    expect(res.reasonCode).toBe('POLICY_DECISION_UNSATISFIED');
    expect(res.expected).toBe('CONTENT_REMOVED_OR_REDACTED');
    expect(res.observed).toBe('UNMODIFIED_SOURCE_ARTIFACT');
  });

  test('REDACT decision where checksum differs BUT known prohibited content survives fails policy verification', () => {
    const res = PolicyVerifier.verify('REDACT', srcChecksum, outChecksum, true, false, false);
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAILED');
    expect(res.reasonCode).toBe('KNOWN_PROHIBITED_CONTENT_REMAINS');
    expect(res.expected).toBe('CONTENT_REMOVED_OR_REDACTED');
    expect(res.observed).toBe('KNOWN_PROHIBITED_CONTENT_REMAINS');
  });

  test('REDACT decision where output is transformed and clean passes policy verification', () => {
    const res = PolicyVerifier.verify('REDACT', srcChecksum, outChecksum, false, false, false);
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
    expect(res.reasonCode).toBe('POLICY_VERIFIED');
    expect(res.expected).toBe('CONTENT_REMOVED_OR_REDACTED');
    expect(res.observed).toBe('NO_KNOWN_PROHIBITED_CONTENT');
  });
});
