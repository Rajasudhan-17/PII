import { api } from './client';

export interface HealthReport {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptime: number;
  dependencies: {
    mongodb: string;
    redis: string;
  };
}

export interface ReadinessReport {
  status: 'ready' | 'not_ready' | 'error';
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  dependencies: {
    mongodb: string;
    redis: string;
  };
}

export interface LivenessReport {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
}

// Backward compatibility alias
export type HealthStatus = HealthReport;

export const systemApi = {
  getHealth: () =>
    api.get<HealthReport>('/health'),

  getReadiness: () =>
    api.get<ReadinessReport>('/health/readiness'),

  getLiveness: () =>
    api.get<LivenessReport>('/health/liveness'),
};
