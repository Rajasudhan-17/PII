import { PolicyVerifier } from '../../src/services/verification/verifiers/policyVerifier';

describe('PolicyVerifier — REVIEW Semantic Verification Unit Tests', () => {
  const srcChecksum = 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123';
  const outChecksum = 'f6e5d4c3b2a10123456789abcdef0123456789abcdef0123456789abcdef0123';

  test('REVIEW decision with review state maintained returns PARTIAL verified status', () => {
    const res = PolicyVerifier.verify('REVIEW', srcChecksum, outChecksum, false, false, false);
    expect(res.passed).toBe(true);
    expect(res.status).toBe('PARTIAL');
    expect(res.reasonCode).toBe('REVIEW_STATE_MAINTAINED');
    expect(res.expected).toBe('REVIEW_PENDING_NOT_PUBLISHED_SANITIZED');
  });

  test('REVIEW decision falsely published as sanitized fails policy verification', () => {
    const res = PolicyVerifier.verify('REVIEW', srcChecksum, outChecksum, false, false, true);
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAILED');
    expect(res.reasonCode).toBe('FALSELY_PUBLISHED_AS_SANITIZED');
  });
});
