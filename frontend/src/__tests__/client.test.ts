import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, setAuthTokenGetter, setOnUnauthorizedHandler } from '../api/client';
import { ApiError } from '../types/api';

describe('API Client Foundation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAuthTokenGetter(() => null);
    setOnUnauthorizedHandler(() => {});
  });

  it('correctly constructs URL and executes GET request', async () => {
    const mockData = { status: 'healthy' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });
    global.fetch = fetchMock;

    const result = await api.get('/health/liveness');
    expect(result).toEqual(mockData);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/health/liveness'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('attaches Bearer token when authTokenGetter returns token', async () => {
    setAuthTokenGetter(() => 'test-jwt-token-12345');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 'u1' } }),
    });
    global.fetch = fetchMock;

    await api.get('/auth/me');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-jwt-token-12345',
        }),
      })
    );
  });

  it('parses structured backend error responses and throws ApiError', async () => {
    const backendError = {
      error: {
        code: 'ACCOUNT_LOCKED',
        message: 'Account locked due to repeated failed login attempts.',
        requestId: 'req-abc-123',
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => backendError,
    });
    global.fetch = fetchMock;

    await expect(api.post('/auth/login', { email: 'test@invalid', password: 'bad' })).rejects.toThrow(
      ApiError
    );

    try {
      await api.post('/auth/login', { email: 'test@invalid', password: 'bad' });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe('ACCOUNT_LOCKED');
      expect(apiErr.status).toBe(400);
      expect(apiErr.requestId).toBe('req-abc-123');
    }
  });

  it('triggers onUnauthorizedHandler on HTTP 401', async () => {
    const unauthorizedSpy = vi.fn();
    setOnUnauthorizedHandler(unauthorizedSpy);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Token missing' } }),
    });
    global.fetch = fetchMock;

    await expect(api.get('/organizations/org1/documents')).rejects.toThrow();
    expect(unauthorizedSpy).toHaveBeenCalledTimes(1);
  });
});
