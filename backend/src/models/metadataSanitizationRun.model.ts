import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type SanitizationOperation = 'SANITY_STRIP' | 'SANITY_MUTATE' | 'FULL_CLEAN';
export type MetadataSanitizationStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'REJECTED';

export interface IMetadataSanitizationWarning {
  code: string;
  message: string;
}

export interface IMetadataSanitizationRun extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  sanitizationRunId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  sourceArtifactId: string;
  sourceChecksum: string;
  transformationRunId?: string | null;
  configurationVersion: string;
  configurationHash: string;
  sanitizerVersion: string;
  operation: SanitizationOperation;
  status: MetadataSanitizationStatus;
  isLatestActive: boolean;
  requestId?: string | null;
  metadataDiscoveredCount: number;
  metadataRemovedCount: number;
  metadataPreservedCount: number;
  unsupportedCount: number;
  warnings: IMetadataSanitizationWarning[];
  outputArtifactId?: string | null;
  startedAt: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const warningSchema = new Schema<IMetadataSanitizationWarning>(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const metadataSanitizationRunSchema = new Schema<IMetadataSanitizationRun>(
  {
    sanitizationRunId: { type: String, required: true, unique: true, index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    sourceArtifactId: { type: String, required: true, index: true },
    sourceChecksum: { type: String, required: true },
    transformationRunId: { type: String, default: null },
    configurationVersion: { type: String, default: '1.0.0' },
    configurationHash: { type: String, required: true, index: true },
    sanitizerVersion: { type: String, default: '1.0.0' },
    operation: {
      type: String,
      enum: ['SANITY_STRIP', 'SANITY_MUTATE', 'FULL_CLEAN'],
      default: 'FULL_CLEAN',
      required: true,
    },
    status: {
      type: String,
      enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'REJECTED'],
      default: 'QUEUED',
      required: true,
    },
    isLatestActive: { type: Boolean, default: false },
    requestId: { type: String, default: null },
    metadataDiscoveredCount: { type: Number, default: 0 },
    metadataRemovedCount: { type: Number, default: 0 },
    metadataPreservedCount: { type: Number, default: 0 },
    unsupportedCount: { type: Number, default: 0 },
    warnings: [warningSchema],
    outputArtifactId: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

// 1. Single active sanitized run per tenant + document
metadataSanitizationRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { name: 'idx_unique_active_sanit_run', unique: true, partialFilterExpression: { isLatestActive: true } }
);

// 2. Single running sanitization job per tenant + document
metadataSanitizationRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { name: 'idx_unique_running_sanit_run', unique: true, partialFilterExpression: { status: 'RUNNING' } }
);

// 3. Durable multi-process idempotency identity per tenant + document + sourceArtifact + sourceChecksum + configurationHash + operation
metadataSanitizationRunSchema.index(
  {
    organizationId: 1,
    documentId: 1,
    sourceArtifactId: 1,
    sourceChecksum: 1,
    configurationHash: 1,
    operation: 1,
  },
  {
    name: 'idx_unique_sanit_idempotency',
    unique: true,
    partialFilterExpression: { status: { $in: ['QUEUED', 'RUNNING'] } },
  }
);

export const MetadataSanitizationRunModel = mongoose.model<IMetadataSanitizationRun>(
  'MetadataSanitizationRun',
  metadataSanitizationRunSchema
);
