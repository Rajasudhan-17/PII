import { connectDatabase, disconnectDatabase, getDatabaseStatus } from '../../src/config/database';

describe('MongoDB Connection Foundation', () => {
  afterAll(async () => {
    await disconnectDatabase();
    try {
      await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
    } catch {
      // ignore
    }
  });

  test('reports disconnected status when not connected', () => {
    expect(getDatabaseStatus()).toBe('disconnected');
  });

  test('handles connection failure predictably with invalid URI', async () => {
    const invalidUri = 'mongodb://127.0.0.1:9999/non_existent_db_xyz';
    await expect(connectDatabase(invalidUri)).rejects.toThrow();
    expect(getDatabaseStatus()).toBe('disconnected');
  });
});
