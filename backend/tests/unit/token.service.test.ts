import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../src/services/token.service';

describe('JWT & Token Lifecycle Unit Tests', () => {
  test('generates and verifies valid access tokens', () => {
    const payload = {
      userId: '60f1b2c3d4e5f6a7b8c9d0e1',
      email: 'user@example.com',
      role: 'USER' as const,
      status: 'ACTIVE' as const,
    };

    const token = generateAccessToken(payload);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });

  test('generates and verifies valid refresh tokens with familyId', async () => {
    const userId = '60f1b2c3d4e5f6a7b8c9d0e1';
    const { refreshToken, tokenId, familyId } = await generateRefreshToken(userId);

    expect(refreshToken).toBeDefined();
    expect(tokenId).toBeDefined();
    expect(familyId).toBeDefined();

    const decoded = verifyRefreshToken(refreshToken);
    expect(decoded.userId).toBe(userId);
    expect(decoded.tokenId).toBe(tokenId);
    expect(decoded.familyId).toBe(familyId);
  });

  test('rejects tampered or malformed JWT tokens', () => {
    expect(() => verifyAccessToken('invalid.token.signature')).toThrow();
    expect(() => verifyRefreshToken('malformed_token_string')).toThrow();
  });
});
