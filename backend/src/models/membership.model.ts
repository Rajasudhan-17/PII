import mongoose, { Schema, Document, Model } from 'mongoose';
import { TenantRole, MembershipStatus } from '../types';

export interface IOrganizationMembership extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  tenantRole: TenantRole;
  status: MembershipStatus;
  invitedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const membershipSchema = new Schema<IOrganizationMembership>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    tenantRole: {
      type: String,
      enum: ['ORG_ADMIN', 'REVIEWER', 'ANALYST', 'MEMBER'],
      default: 'MEMBER',
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED'],
      default: 'ACTIVE',
      index: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring a user cannot have duplicate active/invited/suspended membership in the same organization
membershipSchema.index(
  { userId: 1, organizationId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['ACTIVE', 'INVITED', 'SUSPENDED'] } },
  }
);

// Compound index for member listings and user organization listings
membershipSchema.index({ organizationId: 1, status: 1 });
membershipSchema.index({ userId: 1, status: 1 });

export const OrganizationMembership: Model<IOrganizationMembership> = mongoose.model<IOrganizationMembership>(
  'OrganizationMembership',
  membershipSchema
);
