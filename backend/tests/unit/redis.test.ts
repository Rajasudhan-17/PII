import { connectRedis, disconnectRedis, getRedisStatus, isRedisConnected } from '../../src/config/redis';

describe('Redis Connection Foundation', () => {
  afterEach(async () => {
    await disconnectRedis();
  });

  test('reports disconnected status initially', () => {
    expect(isRedisConnected()).toBe(false);
    expect(getRedisStatus()).toBe('disconnected');
  });

  test('handles failure predictably with invalid host', async () => {
    const invalidUrl = 'redis://127.0.0.1:9999';
    await expect(connectRedis(invalidUrl)).rejects.toThrow();
    expect(isRedisConnected()).toBe(false);
  });
});
