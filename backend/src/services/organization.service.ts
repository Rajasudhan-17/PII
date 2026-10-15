import mongoose from 'mongoose';
import { Organization, IOrganization } from '../models/organization.model';
import { OrganizationMembership } from '../models/membership.model';
import { toOrganizationResponseDTO, OrganizationResponseDTO } from '../dto/organization.dto';
import { AppError } from '../utils/AppError';
import { logAuthAuditEvent } from './audit.service';

export const createOrganization = async (
  name: string,
  userId: string,
  requestId?: string,
  ip?: string
): Promise<OrganizationResponseDTO> => {
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    throw AppError.badRequest('Organization name must be between 2 and 100 characters long.', 'INVALID_ORGANIZATION_NAME');
  }

  const trimmedName = name.trim();
  const normalizedName = trimmedName.toLowerCase();
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Check name uniqueness
  const existing = await Organization.findOne({ normalizedName });
  if (existing) {
    logAuthAuditEvent({
      event: 'ORGANIZATION_CREATED',
      userId,
      requestId,
      ip,
      outcome: 'FAILURE',
      reason: 'DUPLICATE_ORGANIZATION_NAME',
    });
    throw AppError.badRequest('An organization with this name already exists.', 'DUPLICATE_ORGANIZATION_NAME');
  }

  let createdOrg: IOrganization;
  let session: mongoose.ClientSession | null = null;

  // Try Mongoose Session Transaction if replica set is active
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const newOrg = new Organization({
      name: trimmedName,
      normalizedName,
      status: 'ACTIVE',
      createdBy: userObjectId,
    });
    await newOrg.save({ session });

    const newMembership = new OrganizationMembership({
      userId: userObjectId,
      organizationId: newOrg._id,
      tenantRole: 'ORG_ADMIN',
      status: 'ACTIVE',
      invitedBy: userObjectId,
    });
    await newMembership.save({ session });

    await session.commitTransaction();
    createdOrg = newOrg;
  } catch {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }

    // Resilient fallback for standalone MongoDB instances without replica set
    const newOrg = new Organization({
      name: trimmedName,
      normalizedName,
      status: 'ACTIVE',
      createdBy: userObjectId,
    });
    await newOrg.save();

    try {
      const newMembership = new OrganizationMembership({
        userId: userObjectId,
        organizationId: newOrg._id,
        tenantRole: 'ORG_ADMIN',
        status: 'ACTIVE',
        invitedBy: userObjectId,
      });
      await newMembership.save();
    } catch (membershipErr) {
      // Rollback org creation if initial admin membership failed
      await Organization.deleteOne({ _id: newOrg._id });
      throw membershipErr;
    }

    createdOrg = newOrg;
  } finally {
    if (session) {
      session.endSession();
    }
  }

  logAuthAuditEvent({
    event: 'ORGANIZATION_CREATED',
    userId,
    organizationId: createdOrg._id.toString(),
    requestId,
    ip,
    outcome: 'SUCCESS',
  });

  logAuthAuditEvent({
    event: 'MEMBER_ADDED',
    userId,
    organizationId: createdOrg._id.toString(),
    requestId,
    ip,
    outcome: 'SUCCESS',
    details: { tenantRole: 'ORG_ADMIN', isInitialCreator: true },
  });

  return toOrganizationResponseDTO(createdOrg);
};

export const listUserOrganizations = async (
  userId: string,
  isSuperAdmin: boolean = false
): Promise<OrganizationResponseDTO[]> => {
  if (isSuperAdmin) {
    const allOrgs = await Organization.find({ status: 'ACTIVE' }).sort({ createdAt: -1 });
    return allOrgs.map(toOrganizationResponseDTO);
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const memberships = await OrganizationMembership.find({
    userId: userObjectId,
    status: 'ACTIVE',
  }).populate<{ organizationId: IOrganization }>('organizationId');

  const activeOrgs: IOrganization[] = [];
  for (const m of memberships) {
    if (m.organizationId && m.organizationId.status === 'ACTIVE') {
      activeOrgs.push(m.organizationId);
    }
  }

  return activeOrgs.map(toOrganizationResponseDTO);
};

export const getOrganizationById = async (organizationId: string): Promise<OrganizationResponseDTO> => {
  const orgObjectId = new mongoose.Types.ObjectId(organizationId);
  const org = await Organization.findById(orgObjectId);
  if (!org) {
    throw AppError.notFound('Organization not found.', 'ORGANIZATION_NOT_FOUND');
  }
  return toOrganizationResponseDTO(org);
};
