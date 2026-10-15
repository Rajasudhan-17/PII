export type UserRole = 'USER' | 'REVIEWER' | 'ANALYST' | 'ORG_ADMIN' | 'SUPER_ADMIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'LOCKED' | 'PENDING_VERIFICATION';

export type Permission =
  | 'AUTH_READ'
  | 'AUTH_MANAGE'
  | 'USER_READ'
  | 'USER_MANAGE'
  | 'REVIEW_READ'
  | 'REVIEW_EXECUTE'
  | 'REVIEW_ASSIGN'
  | 'REVIEW_ADJUDICATE'
  | 'FEEDBACK_READ'
  | 'FEEDBACK_SUBMIT'
  | 'FEEDBACK_APPROVE'
  | 'EVALUATION_EXECUTE'
  | 'EVALUATION_READ'
  | 'ANALYTICS_READ'
  | 'SYSTEM_ADMIN'
  | 'DOCUMENT_READ'
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_DELETE'
  | 'DOCUMENT_DOWNLOAD'
  | 'POLICY_READ'
  | 'POLICY_MANAGE'
  | 'DECISION_READ'
  | 'DECISION_EXECUTE'
  | 'TRANSFORMATION_READ'
  | 'TRANSFORMATION_EXECUTE'
  | 'SANITY_READ'
  | 'SANITY_EXECUTE'
  | 'RISK_READ'
  | 'RISK_EXECUTE'
  | 'VERIFICATION_READ'
  | 'VERIFICATION_EXECUTE';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken?: string;
}

export interface Organization {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: string;
}

export interface OrganizationMembership {
  organizationId: string;
  organizationName: string;
  role: 'ORG_ADMIN' | 'REVIEWER' | 'ANALYST' | 'MEMBER';
}
