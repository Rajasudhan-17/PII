import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { UserProfile, UserRole, Permission, Organization } from '../types/auth';
import { authApi } from '../api/auth.api';
import { organizationApi } from '../api/organization.api';
import {
  setAuthTokenGetter,
  setTenantIdGetter,
  setTokenRefresher,
  setOnUnauthorizedHandler,
} from '../api/client';

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  organizations: Organization[];
  currentOrgId: string | null;
  currentOrg: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setCurrentOrgId: (orgId: string) => void;
  refreshSession: () => Promise<string | null>;
  hasRole: (...roles: UserRole[]) => boolean;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'pii_auth_token';
const REFRESH_TOKEN_KEY = 'pii_refresh_token';
const USER_KEY = 'pii_auth_user';
const ORG_KEY = 'pii_current_org';

// Verified role permissions matrix (aligned 1:1 with backend rbac.ts)
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const stored = sessionStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    return sessionStorage.getItem(TOKEN_KEY) || null;
  });

  const [refreshToken, setRefreshToken] = useState<string | null>(() => {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY) || null;
  });

  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(() => {
    const saved = sessionStorage.getItem(ORG_KEY);
    return saved && saved !== 'org_primary' && saved !== 'undefined' && saved !== 'null' ? saved : null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Keep a ref to the latest refresh token for closures
  const refreshTokenRef = useRef<string | null>(refreshToken);
  refreshTokenRef.current = refreshToken;

  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;

  const currentOrgIdRef = useRef<string | null>(currentOrgId);
  currentOrgIdRef.current = currentOrgId;

  // Bind API client getters
  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
    setTenantIdGetter(() => currentOrgIdRef.current);
  }, [token, currentOrgId]);

  const clearSessionState = useCallback(() => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    setOrganizations([]);
    setCurrentOrgIdState(null);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(ORG_KEY);
  }, []);

  const logout = useCallback(async () => {
    try {
      const rt = refreshTokenRef.current || undefined;
      await authApi.logout(rt);
    } catch {
      // Ignore network errors during logout
    } finally {
      clearSessionState();
    }
  }, [clearSessionState]);

  // Token refresh handler
  const refreshSession = useCallback(async (): Promise<string | null> => {
    try {
      const currentRt = refreshTokenRef.current || undefined;
      const response = await authApi.refresh(currentRt);
      if (response && response.accessToken) {
        setToken(response.accessToken);
        tokenRef.current = response.accessToken;
        sessionStorage.setItem(TOKEN_KEY, response.accessToken);

        if (response.refreshToken) {
          setRefreshToken(response.refreshToken);
          refreshTokenRef.current = response.refreshToken;
          sessionStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
        }

        return response.accessToken;
      }
      return null;
    } catch {
      clearSessionState();
      return null;
    }
  }, [clearSessionState]);

  // Bind token refresher and 401 callback in API client
  useEffect(() => {
    setTokenRefresher(refreshSession);
    setOnUnauthorizedHandler(() => {
      clearSessionState();
    });
  }, [refreshSession, clearSessionState]);

  // Initialize organizations for authenticated user
  const loadUserOrganizations = useCallback(
    async (_targetUser?: UserProfile): Promise<Organization[]> => {
      try {
        const res = await organizationApi.listOrganizations();
        const orgs = res.organizations || [];
        setOrganizations(orgs);

        // Auto-select valid organization context
        const savedOrgId = sessionStorage.getItem(ORG_KEY);

        if (orgs.length > 0) {
          const isValidSaved = savedOrgId && orgs.some((o) => o.id === savedOrgId);

          if (isValidSaved) {
            setCurrentOrgIdState(savedOrgId);
          } else {
            const defaultOrg = orgs[0].id;
            setCurrentOrgIdState(defaultOrg);
            sessionStorage.setItem(ORG_KEY, defaultOrg);
          }
        }
        return orgs;
      } catch {
        return [];
      }
    },
    []
  );

  // Session restoration on application reload
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const storedToken = sessionStorage.getItem(TOKEN_KEY);
      const storedRefreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);

      if (!storedToken && !storedRefreshToken) {
        setIsLoading(false);
        return;
      }

      try {
        // Attempt retrieving profile with active token
        const profileRes = await authApi.getMe();
        if (isMounted) {
          setUser(profileRes.user);
          sessionStorage.setItem(USER_KEY, JSON.stringify(profileRes.user));
          await loadUserOrganizations(profileRes.user);
        }
      } catch {
        // If access token is expired, try refreshing
        try {
          const newAccessToken = await refreshSession();
          if (newAccessToken && isMounted) {
            const profileRes = await authApi.getMe();
            setUser(profileRes.user);
            sessionStorage.setItem(USER_KEY, JSON.stringify(profileRes.user));
            await loadUserOrganizations(profileRes.user);
          } else if (isMounted) {
            clearSessionState();
          }
        } catch {
          if (isMounted) {
            clearSessionState();
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, [loadUserOrganizations, refreshSession, clearSessionState]);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        const res = await authApi.login({ email, password });
        setUser(res.user);
        setToken(res.accessToken);
        tokenRef.current = res.accessToken;
        sessionStorage.setItem(TOKEN_KEY, res.accessToken);
        sessionStorage.setItem(USER_KEY, JSON.stringify(res.user));

        if (res.refreshToken) {
          setRefreshToken(res.refreshToken);
          refreshTokenRef.current = res.refreshToken;
          sessionStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
        }

        // Initialize tenant organization context
        await loadUserOrganizations(res.user);
      } finally {
        setIsLoading(false);
      }
    },
    [loadUserOrganizations]
  );

  const setCurrentOrgId = useCallback(
    (orgId: string) => {
      // Validate that orgId exists in user memberships or user is SUPER_ADMIN
      const isMember = organizations.some((o) => o.id === orgId);
      const isSuper = user?.role === 'SUPER_ADMIN';

      if (isMember || isSuper) {
        setCurrentOrgIdState(orgId);
        currentOrgIdRef.current = orgId;
        sessionStorage.setItem(ORG_KEY, orgId);
      }
    },
    [organizations, user]
  );

  const currentOrg = useMemo(() => {
    if (!currentOrgId) return null;
    return organizations.find((o) => o.id === currentOrgId) || null;
  }, [organizations, currentOrgId]);

  const hasRole = useCallback(
    (...roles: UserRole[]): boolean => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      if (!user) return false;
      const userPermissions = ROLE_PERMISSIONS[user.role] || [];
      return userPermissions.includes(permission);
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      organizations,
      currentOrgId,
      currentOrg,
      isLoading,
      isAuthenticated: Boolean(user && token),
      login,
      logout,
      setCurrentOrgId,
      refreshSession,
      hasRole,
      hasPermission,
    }),
    [
      user,
      token,
      organizations,
      currentOrgId,
      currentOrg,
      isLoading,
      login,
      logout,
      setCurrentOrgId,
      refreshSession,
      hasRole,
      hasPermission,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
