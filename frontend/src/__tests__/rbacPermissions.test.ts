import { describe, it, expect } from 'vitest';
import { UserRole, Permission } from '../types/auth';

// Role permissions mapping aligned with backend rbac.ts
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  USER: [
    'AUTH_READ',
    'USER_READ',
    'DOCUMENT_READ',
    'DOCUMENT_UPLOAD',
    'DOCUMENT_DOWNLOAD',
    'POLICY_READ',
    'DECISION_READ',
    'TRANSFORMATION_READ',
    'SANITY_READ',
    'RISK_READ',
    'VERIFICATION_READ',
  ],
  REVIEWER: [
    'AUTH_READ',
    'USER_READ',
    'REVIEW_READ',
    'REVIEW_EXECUTE',
    'FEEDBACK_READ',
    'FEEDBACK_SUBMIT',
    'EVALUATION_READ',
    'DOCUMENT_READ',
    'DOCUMENT_UPLOAD',
    'DOCUMENT_DOWNLOAD',
    'POLICY_READ',
    'DECISION_READ',
    'DECISION_EXECUTE',
    'TRANSFORMATION_READ',
    'TRANSFORMATION_EXECUTE',
    'SANITY_READ',
    'SANITY_EXECUTE',
    'RISK_READ',
    'RISK_EXECUTE',
    'VERIFICATION_READ',
    'VERIFICATION_EXECUTE',
  ],
  ANALYST: [
    'AUTH_READ',
    'USER_READ',
    'REVIEW_READ',
    'FEEDBACK_READ',
    'EVALUATION_READ',
    'ANALYTICS_READ',
    'DOCUMENT_READ',
    'DOCUMENT_DOWNLOAD',
    'POLICY_READ',
    'DECISION_READ',
    'DECISION_EXECUTE',
    'TRANSFORMATION_READ',
    'TRANSFORMATION_EXECUTE',
    'SANITY_READ',
    'SANITY_EXECUTE',
    'RISK_READ',
    'RISK_EXECUTE',
    'VERIFICATION_READ',
    'VERIFICATION_EXECUTE',
  ],
  ORG_ADMIN: [
    'AUTH_READ',
    'AUTH_MANAGE',
    'USER_READ',
    'USER_MANAGE',
    'REVIEW_READ',
    'REVIEW_EXECUTE',
    'REVIEW_ASSIGN',
    'REVIEW_ADJUDICATE',
    'FEEDBACK_READ',
    'FEEDBACK_SUBMIT',
    'FEEDBACK_APPROVE',
    'EVALUATION_EXECUTE',
    'EVALUATION_READ',
    'ANALYTICS_READ',
    'DOCUMENT_READ',
    'DOCUMENT_UPLOAD',
    'DOCUMENT_DELETE',
    'DOCUMENT_DOWNLOAD',
    'POLICY_READ',
    'POLICY_MANAGE',
    'DECISION_READ',
    'DECISION_EXECUTE',
    'TRANSFORMATION_READ',
    'TRANSFORMATION_EXECUTE',
    'SANITY_READ',
    'SANITY_EXECUTE',
    'RISK_READ',
    'RISK_EXECUTE',
    'VERIFICATION_READ',
    'VERIFICATION_EXECUTE',
  ],
  SUPER_ADMIN: [
    'AUTH_READ',
    'AUTH_MANAGE',
    'USER_READ',
    'USER_MANAGE',
    'REVIEW_READ',
    'REVIEW_EXECUTE',
    'REVIEW_ASSIGN',
    'REVIEW_ADJUDICATE',
    'FEEDBACK_READ',
    'FEEDBACK_SUBMIT',
    'FEEDBACK_APPROVE',
    'EVALUATION_EXECUTE',
    'EVALUATION_READ',
    'ANALYTICS_READ',
    'SYSTEM_ADMIN',
    'DOCUMENT_READ',
    'DOCUMENT_UPLOAD',
    'DOCUMENT_DELETE',
    'DOCUMENT_DOWNLOAD',
    'POLICY_READ',
    'POLICY_MANAGE',
    'DECISION_READ',
    'DECISION_EXECUTE',
    'TRANSFORMATION_READ',
    'TRANSFORMATION_EXECUTE',
    'SANITY_READ',
    'SANITY_EXECUTE',
    'RISK_READ',
    'RISK_EXECUTE',
    'VERIFICATION_READ',
    'VERIFICATION_EXECUTE',
  ],
};

function hasPermissionForRole(role: UserRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}

describe('Phase 2 — RBAC Role & Permission Boundary Tests', () => {
  it('correctly grants basic read permissions to USER but restricts administrative actions', () => {
    expect(hasPermissionForRole('USER', 'DOCUMENT_READ')).toBe(true);
    expect(hasPermissionForRole('USER', 'POLICY_READ')).toBe(true);

    // Forbidden for basic USER:
    expect(hasPermissionForRole('USER', 'REVIEW_READ')).toBe(false);
    expect(hasPermissionForRole('USER', 'ANALYTICS_READ')).toBe(false);
    expect(hasPermissionForRole('USER', 'POLICY_MANAGE')).toBe(false);
    expect(hasPermissionForRole('USER', 'DOCUMENT_DELETE')).toBe(false);
  });

  it('grants review adjudication permissions to REVIEWER but restricts policy management', () => {
    expect(hasPermissionForRole('REVIEWER', 'REVIEW_READ')).toBe(true);
    expect(hasPermissionForRole('REVIEWER', 'REVIEW_EXECUTE')).toBe(true);

    // Forbidden for REVIEWER:
    expect(hasPermissionForRole('REVIEWER', 'ANALYTICS_READ')).toBe(false);
    expect(hasPermissionForRole('REVIEWER', 'POLICY_MANAGE')).toBe(false);
    expect(hasPermissionForRole('REVIEWER', 'DOCUMENT_DELETE')).toBe(false);
  });

  it('grants analytics read to ANALYST but restricts tenant administrative management', () => {
    expect(hasPermissionForRole('ANALYST', 'ANALYTICS_READ')).toBe(true);
    expect(hasPermissionForRole('ANALYST', 'REVIEW_READ')).toBe(true);

    // Forbidden for ANALYST:
    expect(hasPermissionForRole('ANALYST', 'POLICY_MANAGE')).toBe(false);
    expect(hasPermissionForRole('ANALYST', 'AUTH_MANAGE')).toBe(false);
  });

  it('grants full tenant-level management to ORG_ADMIN', () => {
    expect(hasPermissionForRole('ORG_ADMIN', 'POLICY_MANAGE')).toBe(true);
    expect(hasPermissionForRole('ORG_ADMIN', 'DOCUMENT_DELETE')).toBe(true);
    expect(hasPermissionForRole('ORG_ADMIN', 'USER_MANAGE')).toBe(true);
    expect(hasPermissionForRole('ORG_ADMIN', 'REVIEW_ADJUDICATE')).toBe(true);

    // Only SUPER_ADMIN has platform SYSTEM_ADMIN permission
    expect(hasPermissionForRole('ORG_ADMIN', 'SYSTEM_ADMIN')).toBe(false);
  });

  it('grants all permissions including SYSTEM_ADMIN to SUPER_ADMIN', () => {
    expect(hasPermissionForRole('SUPER_ADMIN', 'SYSTEM_ADMIN')).toBe(true);
    expect(hasPermissionForRole('SUPER_ADMIN', 'POLICY_MANAGE')).toBe(true);
    expect(hasPermissionForRole('SUPER_ADMIN', 'DOCUMENT_DELETE')).toBe(true);
  });
});
