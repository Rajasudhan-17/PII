import { IOrganizationMembership } from '../models/membership.model';
import { IUser } from '../models/user.model';
import { toUserResponseDTO, UserResponseDTO } from './user.dto';
import { TenantRole, MembershipStatus } from '../types';

export interface MembershipResponseDTO {
  id: string;
  userId: string;
  organizationId: string;
  tenantRole: TenantRole;
  status: MembershipStatus;
  invitedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemberUserResponseDTO {
  membershipId: string;
  tenantRole: TenantRole;
  status: MembershipStatus;
  joinedAt: string;
  user: UserResponseDTO;
}

export const toMembershipResponseDTO = (membership: IOrganizationMembership): MembershipResponseDTO => {
  return {
    id: membership._id.toString(),
    userId: membership.userId ? (membership.userId._id ? membership.userId._id.toString() : membership.userId.toString()) : '',
    organizationId: membership.organizationId.toString(),
    tenantRole: membership.tenantRole,
    status: membership.status,
    invitedBy: membership.invitedBy ? membership.invitedBy.toString() : undefined,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
};

export const toMemberUserResponseDTO = (
  membershipId: string,
  tenantRole: TenantRole,
  status: MembershipStatus,
  joinedAt: Date,
  user: IUser
): MemberUserResponseDTO => {
  return {
    membershipId,
    tenantRole,
    status,
    joinedAt: joinedAt.toISOString(),
    user: toUserResponseDTO(user),
  };
};
