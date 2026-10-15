import { IUser, UserRole, UserStatus } from '../models/user.model';

export interface UserResponseDTO {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const toUserResponseDTO = (user: IUser): UserResponseDTO => {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
};
