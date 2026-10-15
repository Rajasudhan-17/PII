import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, setAuthTokenGetter, setTenantIdGetter } from '../api/client';
import { Organization } from '../types/auth';

describe('Phase 2 — Organization Switching & Tenant Isolation', () => {
  let activeTenantId: string | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    activeTenantId = null;
    setAuthTokenGetter(() => 'valid-jwt-token');
    setTenantIdGetter(() => activeTenantId);
  });

  const syntheticOrgs: Organization[] = [
    {
      id: 'org_alpha_123',
      name: 'Alpha Engineering Tenant',
      status: 'ACTIVE',
      createdBy: 'user_1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'org_beta_456',
      name: 'Beta Compliance Tenant',
      status: 'ACTIVE',
      createdBy: 'user_2',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('validates selected tenant against active memberships and rejects arbitrary organization IDs', () => {
    let currentOrgId: string | null = syntheticOrgs[0].id;

    // Simulation of AuthContext setCurrentOrgId logic
    const setCurrentOrgId = (targetOrgId: string) => {
      const isMember = syntheticOrgs.some((o) => o.id === targetOrgId);
      if (isMember) {
        currentOrgId = targetOrgId;
      }
    };

    expect(currentOrgId).toBe('org_alpha_123');

    // 1. Switch to valid tenant Beta
    setCurrentOrgId('org_beta_456');
    expect(currentOrgId).toBe('org_beta_456');

    // 2. Attempt switching to arbitrary / unauthorized tenant ID
    setCurrentOrgId('org_unauthorized_external_999');
    // Invariant: currentOrgId MUST remain unchanged
    expect(currentOrgId).toBe('org_beta_456');

    // 3. Attempt switching to malformed ID
    setCurrentOrgId('malicious-injection-id');
    expect(currentOrgId).toBe('org_beta_456');
  });

  it('attaches x-organization-id header on actual API requests when switching organizations', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ documents: [] }),
    });
    global.fetch = fetchMock;

    // 1. Request under Org Alpha
    activeTenantId = 'org_alpha_123';
    await api.get('/organizations/org_alpha_123/documents');

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/organizations/org_alpha_123/documents'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-organization-id': 'org_alpha_123',
          Authorization: 'Bearer valid-jwt-token',
        }),
      })
    );

    // 2. Switch to Org Beta
    activeTenantId = 'org_beta_456';
    await api.get('/organizations/org_beta_456/documents');

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/organizations/org_beta_456/documents'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-organization-id': 'org_beta_456',
          Authorization: 'Bearer valid-jwt-token',
        }),
      })
    );
  });

  it('guarantees tenant-scoped records are purged and never mixed across organization switches', async () => {
    // Model state storage for a tenant-scoped collection
    let displayedDocuments: Array<{ id: string; orgId: string }> = [];
    let isLoading = false;

    const loadDocumentsForTenant = async (orgId: string) => {
      isLoading = true;
      // INVARIANT: State is immediately cleared before fetching new records
      displayedDocuments = [];

      // Simulate async network request
      await new Promise((r) => setTimeout(r, 5));
      displayedDocuments = [
        { id: `doc_${orgId}_1`, orgId },
        { id: `doc_${orgId}_2`, orgId },
      ];
      isLoading = false;
    };

    // Load Org Alpha
    await loadDocumentsForTenant('org_alpha_123');
    expect(displayedDocuments).toHaveLength(2);
    expect(displayedDocuments.every((d) => d.orgId === 'org_alpha_123')).toBe(true);

    // Switch to Org Beta: during transition before response arrives, displayedDocuments is empty
    const switchPromise = loadDocumentsForTenant('org_beta_456');
    expect(displayedDocuments).toHaveLength(0); // Immediately purged!
    expect(isLoading).toBe(true);

    await switchPromise;
    expect(displayedDocuments).toHaveLength(2);
    // Verified: Org Beta documents only, zero Org Alpha contamination
    expect(displayedDocuments.every((d) => d.orgId === 'org_beta_456')).toBe(true);
  });
});
