import Redis, { RedisOptions } from 'ioredis';
import { getConfig } from './env';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;
let isConnected = false;

const sanitizeRedisUrl = (url: string): string => {
  return url.replace(/\/\/(.*):(.*)@/, '//***:***@');
};

export const getRedisConnectionOptions = (customUrl?: string): RedisOptions => {
  const url = customUrl || getConfig().REDIS_URL;
  let host = '127.0.0.1';
  let port = 6379;
  let password: string | undefined = undefined;
  let username: string | undefined = undefined;
  let db = 0;
  const isTls = url.startsWith('rediss://');

  try {
    const parsed = new URL(url);
    host = parsed.hostname || '127.0.0.1';
    port = parsed.port ? parseInt(parsed.port, 10) : 6379;
    username = parsed.username || undefined;
    password = parsed.password || undefined;
    if (parsed.pathname && parsed.pathname.length > 1) {
      db = parseInt(parsed.pathname.substring(1), 10) || 0;
    }
  } catch {
    // Fallback if URL parsing fails
  }

  return {
    host,
    port,
    username,
    password,
    db,
    ...(isTls ? { tls: {} } : {}),
    maxRetriesPerRequest: null, // Required by BullMQ
    connectTimeout: 5000,
    enableReadyCheck: false,
    retryStrategy(times) {
      if (times > 3) {
        return null;
      }
      return 200;
    },
  };
};

export const createRedisInstance = (customUrl?: string, options?: RedisOptions): Redis => {
  const connectionOpts = getRedisConnectionOptions(customUrl);
  const instance = new Redis({
    ...connectionOpts,
    lazyConnect: true,
    ...options,
  });

  instance.on('error', (err) => {
    logger.error({ event: 'redis_instance_error', error: err.message }, 'Redis instance error.');
  });

  return instance;
};

export const connectRedis = async (customUrl?: string): Promise<Redis> => {
  if (redisClient && isConnected) {
    return redisClient;
  }

  const url = customUrl || getConfig().REDIS_URL;
  const sanitized = sanitizeRedisUrl(url);

  logger.info({ event: 'redis_connecting', url: sanitized }, 'Connecting to Redis...');

  const client = createRedisInstance(url);
  redisClient = client;

  client.on('connect', () => {
    logger.info({ event: 'redis_connecting_event' }, 'Redis socket connected.');
  });

  client.on('ready', () => {
    isConnected = true;
    logger.info({ event: 'redis_ready' }, 'Redis client ready.');
  });

  client.on('close', () => {
    isConnected = false;
    logger.warn({ event: 'redis_close' }, 'Redis connection closed.');
  });

  try {
    await client.connect();
    isConnected = true;
    return redisClient;
  } catch (err: unknown) {
    isConnected = false;
    try {
      client.disconnect();
    } catch {
      // ignore
    }
    redisClient = null;
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'redis_connection_failed', error: errorMessage }, 'Failed to connect to Redis.');
    throw err;
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    logger.info({ event: 'redis_disconnecting' }, 'Closing Redis connection...');
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnected = false;
      logger.info({ event: 'redis_disconnected_clean' }, 'Redis connection closed.');
    }
  }
};

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    throw new Error('Redis client is not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

export const isRedisConnected = (): boolean => {
  return isConnected && redisClient !== null && redisClient.status === 'ready';
};

export const getRedisStatus = (): 'connected' | 'disconnected' | 'connecting' | 'error' => {
  if (!redisClient) return 'disconnected';
  switch (redisClient.status) {
    case 'ready':
      return isConnected ? 'connected' : 'connecting';
    case 'connect':
    case 'connecting':
    case 'reconnecting':
      return 'connecting';
    default:
      return 'disconnected';
  }
};
