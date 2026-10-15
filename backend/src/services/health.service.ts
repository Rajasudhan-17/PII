import { getDatabaseStatus } from '../config/database';
import { getRedisStatus } from '../config/redis';
import { getConfig } from '../config/env';
import { HealthCheckResponse } from '../types';

export const checkHealth = (): HealthCheckResponse => {
  const mongoStatus = getDatabaseStatus();
  const redisStatus = getRedisStatus();

  const isFullyHealthy = mongoStatus === 'connected' && redisStatus === 'connected';

  const config = getConfig();

  return {
    status: isFullyHealthy ? 'ok' : 'degraded',
    service: 'pii-backend',
    version: '1.0.0',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dependencies: {
      mongodb: mongoStatus,
      redis: redisStatus,
    },
  };
};

export const checkReadiness = (): import('../types').ReadinessResponse => {
  const mongoStatus = getDatabaseStatus();
  const redisStatus = getRedisStatus();

  const isReady = mongoStatus === 'connected' && redisStatus === 'connected';
  const config = getConfig();

  return {
    status: isReady ? 'ready' : 'not_ready',
    service: 'pii-backend',
    version: '1.0.0',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    dependencies: {
      mongodb: mongoStatus,
      redis: redisStatus,
    },
  };
};
