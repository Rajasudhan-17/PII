import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type TransformationOperation = 'REDACTION' | 'MUTATION';
export type TransformationRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';

export interface ITransformationRunWarning {
  code: string;
  message: string;
}

export interface ITransformationRun extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  transformationRunId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  decisionRunId: string;
  sourceChecksum: string;
  sourceDocumentVersion: string;
  transformationVersion: string;
  transformationConfigurationHash: string;
  operation: TransformationOperation;
  status: TransformationRunStatus;
  isLatestActive: boolean;
  requestId?: string | null;
  candidateCount: number;
  totalCandidatesEvaluated?: number;
  transformedCount: number;
  redactedCount?: number;
  maskedCount?: number;
  skippedCount: number;
  failedCount: number;
  warnings: ITransformationRunWarning[];
  outputArtifactId?: string | null;
  startedAt: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const warningSchema = new Schema<ITransformationRunWarning>(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const transformationRunSchema = new Schema<ITransformationRun>(
  {
    transformationRunId: { type: String, required: true, unique: true, index: true },
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
    decisionRunId: { type: String, required: true, index: true },
    sourceChecksum: { type: String, required: true },
    sourceDocumentVersion: { type: String, default: '1.0.0' },
    transformationVersion: { type: String, default: '1.0.0' },
    transformationConfigurationHash: { type: String, required: true, index: true },
    operation: {
      type: String,
      enum: ['REDACTION', 'MUTATION'],
      default: 'REDACTION',
      required: true,
    },
    status: {
      type: String,
      enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'],
      default: 'QUEUED',
      required: true,
    },
    isLatestActive: { type: Boolean, default: false },
    requestId: { type: String, default: null },
    candidateCount: { type: Number, default: 0 },
    totalCandidatesEvaluated: { type: Number, default: 0 },
    transformedCount: { type: Number, default: 0 },
    redactedCount: { type: Number, default: 0 },
    maskedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    warnings: [warningSchema],
    outputArtifactId: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

// 1. Authoritative single active transformed output run per tenant + document
transformationRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { name: 'idx_unique_active_trans_run', unique: true, partialFilterExpression: { isLatestActive: true } }
);

// 2. Single running transformation job per tenant + document
transformationRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { name: 'idx_unique_running_trans_run', unique: true, partialFilterExpression: { status: 'RUNNING' } }
);

// 3. Durable multi-process idempotency identity per tenant + document + decisionRun + operation + configHash + checksum
transformationRunSchema.index(
  {
    organizationId: 1,
    documentId: 1,
    decisionRunId: 1,
    operation: 1,
    transformationConfigurationHash: 1,
    sourceChecksum: 1,
  },
  {
    name: 'idx_unique_trans_idempotency',
    unique: true,
    partialFilterExpression: { status: { $in: ['QUEUED', 'RUNNING'] } },
  }
);

export const TransformationRunModel = mongoose.model<ITransformationRun>(
  'TransformationRun',
  transformationRunSchema
);
