import { validatePasswordPolicy, hashPassword, comparePassword } from '../../src/utils/password';
import { toUserResponseDTO } from '../../src/dto/user.dto';
import { IUser } from '../../src/models/user.model';

describe('Password Security & Policy Unit Tests', () => {
  test('validates password policy correctly', () => {
    expect(validatePasswordPolicy('ValidPass123!').isValid).toBe(true);
    expect(validatePasswordPolicy('short1!').isValid).toBe(false);
    expect(validatePasswordPolicy('no_uppercase_1!').isValid).toBe(false);
    expect(validatePasswordPolicy('NO_LOWERCASE_1!').isValid).toBe(false);
    expect(validatePasswordPolicy('NoSpecialChar123').isValid).toBe(false);
    expect(validatePasswordPolicy('NoDigitsHere!').isValid).toBe(false);
  });

  test('hashes and verifies password using bcrypt', async () => {
    const rawPassword = 'SecurePassword123!';
    const hash = await hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(rawPassword);
    expect(hash.startsWith('$2')).toBe(true);

    const isMatch = await comparePassword(rawPassword, hash);
    expect(isMatch).toBe(true);

    const isWrong = await comparePassword('WrongPassword123!', hash);
    expect(isWrong).toBe(false);
  });
});

describe('User DTO Serialization', () => {
  test('excludes passwordHash and security internal fields from DTO', () => {
    const mockUser = {
      _id: { toString: () => '60f1b2c3d4e5f6a7b8c9d0e1' },
      email: 'Test@Example.com',
      normalizedEmail: 'test@example.com',
      passwordHash: '$2a$12$someSecretHashValueString',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: false,
      failedLoginAttempts: 3,
      lockUntil: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IUser;

    const dto = toUserResponseDTO(mockUser);

    expect(dto.id).toBe('60f1b2c3d4e5f6a7b8c9d0e1');
    expect(dto.email).toBe('Test@Example.com');
    expect(dto.role).toBe('USER');
    expect(dto.status).toBe('ACTIVE');

    const rawDtoRecord = dto as unknown as Record<string, unknown>;
    expect(rawDtoRecord.passwordHash).toBeUndefined();
    expect(rawDtoRecord.failedLoginAttempts).toBeUndefined();
    expect(rawDtoRecord.lockUntil).toBeUndefined();
  });
});
