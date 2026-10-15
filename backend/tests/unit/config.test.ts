import { validateEnv } from '../../src/config/env';

describe('Environment Configuration', () => {
  const baseValidEnv = {
    NODE_ENV: 'test',
    PORT: '5001',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/pii_platform_test',
    REDIS_URL: 'redis://127.0.0.1:6379',
    API_PREFIX: '/api/v1',
    LOG_LEVEL: 'error',
  };

  test('valid environment variables pass validation', () => {
    const config = validateEnv(baseValidEnv);
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(5001);
    expect(config.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/pii_platform_test');
    expect(config.REDIS_URL).toBe('redis://127.0.0.1:6379');
  });

  test('missing MONGODB_URI causes validation failure', () => {
    const testEnv = { ...baseValidEnv, MONGODB_URI: '' };
    expect(() => validateEnv(testEnv)).toThrow('Environment validation failed');
  });

  test('missing REDIS_URL causes validation failure', () => {
    const testEnv = { ...baseValidEnv, REDIS_URL: '' };
    expect(() => validateEnv(testEnv)).toThrow('Environment validation failed');
  });

  test('invalid PORT causes validation failure', () => {
    const testEnv = { ...baseValidEnv, PORT: '999999' };
    expect(() => validateEnv(testEnv)).toThrow('Environment validation failed');
  });
});
