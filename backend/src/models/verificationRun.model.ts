import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type VerificationRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type OverallVerificationStatus = 'VERIFIED' | 'FAILED' | 'PARTIAL' | 'NOT_VERIFIABLE';

export interface IVerificationRun extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  verificationRunId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  sourceArtifactId: string;
  outputArtifactId: string;
  sourceChecksum: string;
  outputChecksum: string;
  configurationVersion: string;
  configurationHash: string;
  verificationModelVersion: string;
  status: VerificationRunStatus;
  overallStatus: OverallVerificationStatus | null;
  overallVerificationScore: number; // 0.00 to 1.00
  totalVerifierCount: number;
  passedVerifierCount: number;
  failedVerifierCount: number;
  unverifiableCount: number;
  isLatestActive: boolean;
  requestId?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const verificationRunSchema = new Schema<IVerificationRun>(
  {
    verificationRunId: { type: String, required: true, unique: true, index: true },
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
    outputArtifactId: { type: String, required: true, index: true },
    sourceChecksum: { type: String, required: true },
    outputChecksum: { type: String, required: true },
    configurationVersion: { type: String, required: true, default: '1.0.0' },
    configurationHash: { type: String, required: true },
    verificationModelVersion: { type: String, required: true, default: '1.0.0' },
    status: {
      type: String,
      enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'],
      default: 'QUEUED',
      required: true,
      index: true,
    },
    overallStatus: {
      type: String,
      enum: ['VERIFIED', 'FAILED', 'PARTIAL', 'NOT_VERIFIABLE'],
      default: null,
      index: true,
    },
    overallVerificationScore: { type: Number, default: 0.0 },
    totalVerifierCount: { type: Number, default: 0 },
    passedVerifierCount: { type: Number, default: 0 },
    failedVerifierCount: { type: Number, default: 0 },
    unverifiableCount: { type: Number, default: 0 },
    isLatestActive: { type: Boolean, default: false, index: true },
    requestId: { type: String, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

// Compound Partial Indexes
verificationRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { unique: true, partialFilterExpression: { isLatestActive: true }, name: 'idx_unique_active_verification_run' }
);

verificationRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { unique: true, partialFilterExpression: { status: 'RUNNING' }, name: 'idx_unique_running_verification_run' }
);

verificationRunSchema.index(
  {
    organizationId: 1,
    documentId: 1,
    sourceArtifactId: 1,
    outputArtifactId: 1,
    sourceChecksum: 1,
    outputChecksum: 1,
    configurationHash: 1,
    verificationModelVersion: 1,
  },
  { unique: true, partialFilterExpression: { status: { $in: ['QUEUED', 'RUNNING'] } }, name: 'idx_unique_verification_idempotency' }
);

export const VerificationRunModel = mongoose.model<IVerificationRun>(
  'VerificationRun',
  verificationRunSchema
);
