import { ApiError, ApiErrorResponse } from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

let authTokenGetter: (() => string | null) | null = null;
let tenantIdGetter: (() => string | null) | null = null;
let tokenRefresher: (() => Promise<string | null>) | null = null;
let onUnauthorizedHandler: (() => void) | null = null;

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    } else {
      prom.reject(new ApiError('Token refresh failed', 401, 'REFRESH_FAILED'));
    }
  });
  failedQueue = [];
};

export const setAuthTokenGetter = (getter: () => string | null) => {
  authTokenGetter = getter;
};

export const setTenantIdGetter = (getter: () => string | null) => {
  tenantIdGetter = getter;
};

export const setTokenRefresher = (refresher: () => Promise<string | null>) => {
  tokenRefresher = refresher;
};

export const setOnUnauthorizedHandler = (handler: () => void) => {
  onUnauthorizedHandler = handler;
};

export const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  const token = authTokenGetter
    ? authTokenGetter()
    : typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('pii_auth_token')
      : null;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const tenantId = tenantIdGetter
    ? tenantIdGetter()
    : typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('pii_active_tenant')
      : null;
  if (tenantId) {
    headers['x-organization-id'] = tenantId;
  }
  return headers;
};

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  _retry?: boolean;
}

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers = {}, _retry = false, ...customConfig } = options;

  let url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const defaultHeaders: Record<string, string> = {};
  if (!(customConfig.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const token = authTokenGetter ? authTokenGetter() : null;
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const tenantId = tenantIdGetter ? tenantIdGetter() : null;
  if (tenantId) {
    defaultHeaders['x-organization-id'] = tenantId;
  }

  const config: RequestInit = {
    credentials: 'include',
    ...customConfig,
    headers: {
      ...defaultHeaders,
      ...(headers as Record<string, string>),
    },
  };

  try {
    const response = await fetch(url, config);

    // Handle 401 Unauthorized with token refresh mutex
    const isAuthEndpoint =
      endpoint.includes('/auth/login') ||
      endpoint.includes('/auth/refresh') ||
      endpoint.includes('/auth/register');

    if (response.status === 401 && !_retry && !isAuthEndpoint && tokenRefresher) {
      if (isRefreshing) {
        // Queue this request while refresh is in progress
        const newToken = await new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        });
        // Retry with new token
        return apiClient<T>(endpoint, {
          ...options,
          _retry: true,
          headers: {
            ...(headers as Record<string, string>),
            Authorization: `Bearer ${newToken}`,
          },
        });
      }

      isRefreshing = true;

      try {
        const refreshedToken = await tokenRefresher();
        if (refreshedToken) {
          processQueue(null, refreshedToken);
          isRefreshing = false;
          // Retry original request
          return apiClient<T>(endpoint, {
            ...options,
            _retry: true,
            headers: {
              ...(headers as Record<string, string>),
              Authorization: `Bearer ${refreshedToken}`,
            },
          });
        } else {
          throw new ApiError('Session refresh failed', 401, 'REFRESH_FAILED');
        }
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        isRefreshing = false;
        if (onUnauthorizedHandler) {
          onUnauthorizedHandler();
        }
        throw refreshErr;
      }
    } else if (response.status === 401) {
      if (onUnauthorizedHandler && !isAuthEndpoint) {
        onUnauthorizedHandler();
      }
    }

    if (!response.ok) {
      let errorBody: ApiErrorResponse | null = null;
      try {
        errorBody = (await response.json()) as ApiErrorResponse;
      } catch {
        // Non-JSON response
      }

      const message =
        errorBody?.error?.message ||
        (typeof errorBody?.error === 'string' ? errorBody.error : null) ||
        (typeof (errorBody as unknown as { message?: string })?.message === 'string'
          ? (errorBody as unknown as { message?: string }).message
          : null) ||
        `Request failed with status ${response.status} (${response.statusText})`;
      const code =
        errorBody?.error?.code ||
        (typeof (errorBody as unknown as { code?: string })?.code === 'string'
          ? (errorBody as unknown as { code?: string }).code
          : null) ||
        `HTTP_${response.status}`;
      const requestId = errorBody?.error?.requestId;
      const details = errorBody?.error?.details;

      throw new ApiError(message, response.status, code, requestId, details);
    }

    // 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('Request was aborted', 0, 'REQUEST_ABORTED');
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error occurred',
      0,
      'NETWORK_ERROR'
    );
  }
}

export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers: body instanceof FormData ? { ...(options?.headers || {}) } : options?.headers,
    }),
  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  delete: <T>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'DELETE' }),
};
