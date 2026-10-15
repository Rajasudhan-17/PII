import { hasPermission, hasAllPermissions, ROLE_PERMISSIONS } from '../../src/config/rbac';

describe('Role-Based Access Control (RBAC) Unit Tests', () => {
  test('correctly evaluates individual role permissions', () => {
    expect(hasPermission('USER', 'USER_READ')).toBe(true);
    expect(hasPermission('USER', 'SYSTEM_ADMIN')).toBe(false);

    expect(hasPermission('REVIEWER', 'REVIEW_EXECUTE')).toBe(true);
    expect(hasPermission('REVIEWER', 'USER_MANAGE')).toBe(false);

    expect(hasPermission('SUPER_ADMIN', 'SYSTEM_ADMIN')).toBe(true);
  });

  test('correctly evaluates multi-permission checks', () => {
    expect(hasAllPermissions('ORG_ADMIN', ['USER_READ', 'USER_MANAGE', 'REVIEW_EXECUTE'])).toBe(true);
    expect(hasAllPermissions('ANALYST', ['USER_READ', 'SYSTEM_ADMIN'])).toBe(false);
  });

  test('ensures all defined roles have assigned permission lists', () => {
    expect(ROLE_PERMISSIONS.USER).toBeDefined();
    expect(ROLE_PERMISSIONS.REVIEWER).toBeDefined();
    expect(ROLE_PERMISSIONS.ANALYST).toBeDefined();
    expect(ROLE_PERMISSIONS.ORG_ADMIN).toBeDefined();
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toBeDefined();
  });
});
