import mongoose, { Schema, Document, Model } from 'mongoose';
import { TenantStatus } from '../types';

export interface IOrganization extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  normalizedName: string;
  status: TenantStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedName: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'DISABLED'],
      default: 'ACTIVE',
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Organization: Model<IOrganization> = mongoose.model<IOrganization>(
  'Organization',
  organizationSchema
);
