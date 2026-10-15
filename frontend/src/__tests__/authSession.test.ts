import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, setAuthTokenGetter, setTokenRefresher, setOnUnauthorizedHandler, setTenantIdGetter } from '../api/client';

describe('Phase 2 — Authentication Lifecycle & Refresh Mutex', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAuthTokenGetter(() => null);
    setTenantIdGetter(() => null);
    setTokenRefresher(async () => null);
    setOnUnauthorizedHandler(() => {});
  });

  it('serializes concurrent requests during access token refresh and executes them with new token', async () => {
    let token = 'initial-expired-token';
    setAuthTokenGetter(() => token);

    let refreshCallCount = 0;
    const tokenRefresher = vi.fn().mockImplementation(async () => {
      refreshCallCount++;
      token = 'new-rotated-token';
      return 'new-rotated-token';
    });
    setTokenRefresher(tokenRefresher);

    let requestCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const authHeader = (init?.headers as Record<string, string>)?.Authorization;

      if (authHeader === 'Bearer initial-expired-token') {
        requestCount++;
        return {
          ok: false,
          status: 401,
          json: async () => ({
            error: { code: 'INVALID_TOKEN', message: 'Token expired' },
          }),
        };
      }

      if (authHeader === 'Bearer new-rotated-token') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, url }),
        };
      }

      return {
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'AUTHENTICATION_REQUIRED' } }),
      };
    });

    global.fetch = fetchMock;

    // Launch 3 simultaneous requests with the expired token
    const [res1, res2, res3] = await Promise.all([
      api.get<{ success: boolean }>('/organizations/org1/documents'),
      api.get<{ success: boolean }>('/organizations/org1/policies'),
      api.get<{ success: boolean }>('/organizations/org1/findings'),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res3.success).toBe(true);

    // CRITICAL: The refresh endpoint must be called exactly ONCE despite 3 concurrent requests
    expect(refreshCallCount).toBe(1);
    expect(requestCount).toBe(3);
  });

  it('clears session and triggers onUnauthorizedHandler when refresh token is invalid or rejected', async () => {
    setAuthTokenGetter(() => 'expired-token');

    const unauthorizedSpy = vi.fn();
    setOnUnauthorizedHandler(unauthorizedSpy);

    const tokenRefresher = vi.fn().mockImplementation(async () => {
      // Refresh fails (e.g. refresh token expired or revoked in Redis)
      return null;
    });
    setTokenRefresher(tokenRefresher);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: 'INVALID_TOKEN', message: 'Token expired' },
      }),
    });
    global.fetch = fetchMock;

    await expect(api.get('/organizations/org1/documents')).rejects.toThrow();
    expect(tokenRefresher).toHaveBeenCalledTimes(1);
    expect(unauthorizedSpy).toHaveBeenCalledTimes(1);
  });

  it('attaches x-organization-id header when tenant is active', async () => {
    setAuthTokenGetter(() => 'valid-access-token');
    setTenantIdGetter(() => 'org_finance_dept_123');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });
    global.fetch = fetchMock;

    await api.get('/organizations/org_finance_dept_123/documents');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-organization-id': 'org_finance_dept_123',
          Authorization: 'Bearer valid-access-token',
        }),
      })
    );
  });

  it('ensures all queued requests reject and settle when refresh fails with no hanging promises', async () => {
    setAuthTokenGetter(() => 'expired-token');

    let refreshAttempted = false;
    const tokenRefresher = vi.fn().mockImplementation(async () => {
      refreshAttempted = true;
      // Simulate delay in refresh before returning failure
      await new Promise((r) => setTimeout(r, 10));
      return null;
    });
    setTokenRefresher(tokenRefresher);

    const unauthorizedSpy = vi.fn();
    setOnUnauthorizedHandler(unauthorizedSpy);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: 'INVALID_TOKEN', message: 'Token expired' },
      }),
    });
    global.fetch = fetchMock;

    // Launch 3 simultaneous requests that will get 401 and queue
    const results = await Promise.allSettled([
      api.get('/organizations/org1/documents'),
      api.get('/organizations/org1/policies'),
      api.get('/organizations/org1/findings'),
    ]);

    expect(refreshAttempted).toBe(true);
    expect(tokenRefresher).toHaveBeenCalledTimes(1);
    expect(unauthorizedSpy).toHaveBeenCalledTimes(1);

    // Verify ALL 3 promises settled and rejected (no hanging promises)
    expect(results).toHaveLength(3);
    for (const res of results) {
      expect(res.status).toBe('rejected');
      if (res.status === 'rejected') {
        expect(res.reason).toBeDefined();
      }
    }
  });

  it('prevents infinite retry loops if the retried request fails with 401 again', async () => {
    setAuthTokenGetter(() => 'initial-token');

    let refreshCallCount = 0;
    const tokenRefresher = vi.fn().mockImplementation(async () => {
      refreshCallCount++;
      return 'rotated-token';
    });
    setTokenRefresher(tokenRefresher);

    // Mock fetch so that even with the new token, backend still returns 401
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: 'UNAUTHORIZED_ACCESS', message: 'Token invalid or revoked' },
      }),
    });
    global.fetch = fetchMock;

    await expect(api.get('/organizations/org1/documents')).rejects.toThrow();

    // Refresh should only have been attempted ONCE (_retry prevented loop)
    expect(refreshCallCount).toBe(1);
    // Fetch should have been called twice (initial + 1 retry), NOT infinitely
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
