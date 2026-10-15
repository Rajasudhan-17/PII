import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { DecisionType, IPolicyRule } from '../config/policyTaxonomy';

export type PolicyStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface IPolicy extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  policyId: string;
  organizationId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  version: number;
  status: PolicyStatus;
  rules: IPolicyRule[];
  defaultDecision: DecisionType;
  configurationHash: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const conditionSchema = new Schema(
  {
    property: { type: String, required: true },
    operator: {
      type: String,
      enum: [
        'EQUALS',
        'NOT_EQUALS',
        'GREATER_THAN',
        'GREATER_THAN_OR_EQUAL',
        'LESS_THAN',
        'LESS_THAN_OR_EQUAL',
        'IN',
        'NOT_IN',
        'EXISTS',
      ],
      required: true,
    },
    value: { type: Schema.Types.Mixed, required: false },
  },
  { _id: false }
);

const ruleSchema = new Schema<IPolicyRule>(
  {
    ruleId: { type: String, required: true },
    name: { type: String, required: true },
    priority: { type: Number, required: true, default: 10 },
    action: { type: String, enum: ['KEEP', 'REVIEW', 'REDACT'], required: true },
    conditions: [conditionSchema],
    rationaleCode: { type: String, required: true },
  },
  { _id: false }
);

const policySchema = new Schema<IPolicy>(
  {
    policyId: { type: String, required: true, index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    version: { type: Number, required: true, default: 1 },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      default: 'DRAFT',
      required: true,
      index: true,
    },
    rules: [ruleSchema],
    defaultDecision: {
      type: String,
      enum: ['KEEP', 'REVIEW', 'REDACT'],
      default: 'REVIEW',
      required: true,
    },
    configurationHash: { type: String, required: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Compound unique index per organization, policyId, and version
policySchema.index({ organizationId: 1, policyId: 1, version: 1 }, { unique: true });
policySchema.index({ organizationId: 1, status: 1 });

export const PolicyModel = mongoose.model<IPolicy>('Policy', policySchema);
