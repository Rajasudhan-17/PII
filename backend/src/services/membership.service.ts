import mongoose from 'mongoose';
import { OrganizationMembership, IOrganizationMembership } from '../models/membership.model';
import { User, IUser } from '../models/user.model';
import {
  toMembershipResponseDTO,
  toMemberUserResponseDTO,
  MembershipResponseDTO,
  MemberUserResponseDTO,
} from '../dto/membership.dto';
import { TenantRole, MembershipStatus } from '../types';
import { AppError } from '../utils/AppError';
import { logAuthAuditEvent } from './audit.service';

export const addOrganizationMember = async (
  organizationId: string,
  email: string,
  tenantRole: TenantRole = 'MEMBER',
  invitedByUserId: string,
  requestId?: string,
  ip?: string
): Promise<MembershipResponseDTO> => {
  if (!email || typeof email !== 'string') {
    throw AppError.badRequest('Target user email is required.', 'INVALID_EMAIL');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const targetUser = await User.findOne({ normalizedEmail });
  if (!targetUser) {
    throw AppError.notFound('User with specified email was not found.', 'USER_NOT_FOUND');
  }

  const orgObjectId = new mongoose.Types.ObjectId(organizationId);
  const targetUserObjectId = targetUser._id;
  const inviterObjectId = new mongoose.Types.ObjectId(invitedByUserId);

  // Check existing membership
  const existing = await OrganizationMembership.findOne({
    userId: targetUserObjectId,
    organizationId: orgObjectId,
  });

  if (existing && (existing.status === 'ACTIVE' || existing.status === 'INVITED')) {
    throw AppError.badRequest('User is already an active member or invited to this organization.', 'MEMBER_ALREADY_EXISTS');
  }

  let membership: IOrganizationMembership;

  if (existing) {
    // Reactivate previously removed or suspended membership
    existing.status = 'ACTIVE';
    existing.tenantRole = tenantRole;
    existing.invitedBy = inviterObjectId;
    await existing.save();
    membership = existing;
  } else {
    // Create new membership
    membership = new OrganizationMembership({
      userId: targetUserObjectId,
      organizationId: orgObjectId,
      tenantRole,
      status: 'ACTIVE',
      invitedBy: inviterObjectId,
    });
    await membership.save();
  }

  logAuthAuditEvent({
    event: 'MEMBER_ADDED',
    userId: invitedByUserId,
    organizationId,
    requestId,
    ip,
    outcome: 'SUCCESS',
    details: { targetUserId: targetUser._id.toString(), tenantRole },
  });

  return toMembershipResponseDTO(membership);
};

export const listOrganizationMembers = async (
  organizationId: string
): Promise<MemberUserResponseDTO[]> => {
  const orgObjectId = new mongoose.Types.ObjectId(organizationId);

  const memberships = await OrganizationMembership.find({
    organizationId: orgObjectId,
    status: { $ne: 'REMOVED' },
  }).populate<{ userId: IUser }>('userId');

  const result: MemberUserResponseDTO[] = [];
  for (const m of memberships) {
    if (m.userId) {
      result.push(
        toMemberUserResponseDTO(
          m._id.toString(),
          m.tenantRole,
          m.status,
          m.createdAt,
          m.userId
        )
      );
    }
  }

  return result;
};

export const updateMemberRoleOrStatus = async (
  organizationId: string,
  targetUserId: string,
  newRole?: TenantRole,
  newStatus?: MembershipStatus,
  updatedByUserId?: string,
  requestId?: string,
  ip?: string
): Promise<MembershipResponseDTO> => {
  const orgObjectId = new mongoose.Types.ObjectId(organizationId);
  const targetUserObjectId = new mongoose.Types.ObjectId(targetUserId);

  const membership = await OrganizationMembership.findOne({
    userId: targetUserObjectId,
    organizationId: orgObjectId,
  });

  if (!membership || membership.status === 'REMOVED') {
    throw AppError.notFound('Membership record not found.', 'MEMBERSHIP_NOT_FOUND');
  }

  // Security Protection: Prevent demoting or removing the last active ORG_ADMIN
  const isCurrentlyAdmin = membership.tenantRole === 'ORG_ADMIN' && membership.status === 'ACTIVE';
  const isRoleChangingAwayFromAdmin = newRole && newRole !== 'ORG_ADMIN';
  const isStatusChangingAwayFromActive = newStatus && newStatus !== 'ACTIVE';

  if (isCurrentlyAdmin && (isRoleChangingAwayFromAdmin || isStatusChangingAwayFromActive)) {
    const activeAdminCount = await OrganizationMembership.countDocuments({
      organizationId: orgObjectId,
      tenantRole: 'ORG_ADMIN',
      status: 'ACTIVE',
    });

    if (activeAdminCount <= 1) {
      throw AppError.badRequest(
        'Cannot demote or remove the final active Organization Administrator. Assign another Organization Administrator first.',
        'CANNOT_REMOVE_LAST_ORG_ADMIN'
      );
    }
  }

  let eventType: 'MEMBER_ROLE_CHANGED' | 'MEMBER_SUSPENDED' | 'MEMBER_REMOVED' = 'MEMBER_ROLE_CHANGED';

  if (newRole) {
    membership.tenantRole = newRole;
  }

  if (newStatus) {
    membership.status = newStatus;
    if (newStatus === 'SUSPENDED') eventType = 'MEMBER_SUSPENDED';
    if (newStatus === 'REMOVED') eventType = 'MEMBER_REMOVED';
  }

  await membership.save();

  logAuthAuditEvent({
    event: eventType,
    userId: updatedByUserId,
    organizationId,
    requestId,
    ip,
    outcome: 'SUCCESS',
    details: { targetUserId, newRole: membership.tenantRole, newStatus: membership.status },
  });

  return toMembershipResponseDTO(membership);
};

export const removeOrganizationMember = async (
  organizationId: string,
  targetUserId: string,
  removedByUserId?: string,
  requestId?: string,
  ip?: string
): Promise<MembershipResponseDTO> => {
  return updateMemberRoleOrStatus(
    organizationId,
    targetUserId,
    undefined,
    'REMOVED',
    removedByUserId,
    requestId,
    ip
  );
};
