import { getOrCreateQueue, closeQueuesAndWorkers, defaultJobOptions } from '../../src/queues/queue';

describe('BullMQ Queue Infrastructure Foundation', () => {
  afterEach(async () => {
    await closeQueuesAndWorkers();
  });

  test('creates and retrieves a queue with standard default options', () => {
    const queue = getOrCreateQueue('testQueue');
    expect(queue).toBeDefined();
    expect(queue.name).toBe('testQueue');
    expect(queue.opts.defaultJobOptions).toEqual(defaultJobOptions);
  });

  test('returns existing queue instance on duplicate getOrCreateQueue call', () => {
    const queue1 = getOrCreateQueue('duplicateQueue');
    const queue2 = getOrCreateQueue('duplicateQueue');
    expect(queue1).toBe(queue2);
  });

  test('gracefully closes queues and workers without throwing', async () => {
    getOrCreateQueue('cleanupQueue');
    await expect(closeQueuesAndWorkers()).resolves.not.toThrow();
  });
});
