import mongoose from 'mongoose';
import { tenantScope, validateObjectId } from '../../src/utils/tenantQuery';

describe('Tenant Query Abstraction & Isolation Helpers Unit Tests', () => {
  const validOrgId = '60f1b2c3d4e5f6a7b8c9d0e1';

  test('validates valid MongoDB ObjectId string', () => {
    const objectId = validateObjectId(validOrgId);
    expect(objectId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(objectId.toString()).toBe(validOrgId);
  });

  test('throws 404 for invalid ObjectId string format to prevent enumeration', () => {
    expect(() => validateObjectId('invalid-id-format')).toThrow('Invalid Resource ID format.');
  });

  test('appends organizationId as ObjectId to filter query', () => {
    const baseFilter = { status: 'ACTIVE', category: 'DOCUMENT' };
    const scopedFilter = tenantScope(validOrgId, baseFilter);

    expect(scopedFilter.status).toBe('ACTIVE');
    expect(scopedFilter.category).toBe('DOCUMENT');
    expect(scopedFilter.organizationId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect((scopedFilter.organizationId as mongoose.Types.ObjectId).toString()).toBe(validOrgId);
  });
});
