import { UserRole, UserStatus } from '../models/user.model';

export type TenantRole = 'ORG_ADMIN' | 'REVIEWER' | 'ANALYST' | 'MEMBER';
export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'REMOVED';

export interface AuthUserContext {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export interface TenantContext {
  organizationId: string;
  organizationName: string;
  organizationStatus: TenantStatus;
  membershipId: string;
  tenantRole: TenantRole;
  membershipStatus: MembershipStatus;
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: AuthUserContext;
      tenantContext?: TenantContext;
    }
  }
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  dependencies: {
    mongodb: 'connected' | 'disconnected' | 'connecting' | 'error';
    redis: 'connected' | 'disconnected' | 'connecting' | 'error';
  };
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptime: number;
  dependencies: {
    mongodb: 'connected' | 'disconnected' | 'connecting' | 'error';
    redis: 'connected' | 'disconnected' | 'connecting' | 'error';
  };
}

export interface APIErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}
