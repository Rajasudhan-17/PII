import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type ReidentificationRiskStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
export type ReidentificationRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'CRITICAL';

export interface IReidentificationRiskWarning {
  code: string;
  message: string;
}

export interface IReidentificationRiskRun extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  riskRunId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  sourceArtifactId: string;
  sanitizedArtifactId: string;
  metadataSanitizationRunId?: string | null;
  sourceChecksum: string;
  sanitizedChecksum: string;
  configurationVersion: string;
  configurationHash: string;
  riskModelVersion: string;
  referencePopulationVersion: string;
  status: ReidentificationRiskStatus;
  isLatestActive: boolean;
  requestId?: string | null;

  reidentificationRiskScore: number; // 0.00 to 1.00
  riskLevel: ReidentificationRiskLevel;
  riskConfidence: number; // 0.00 to 1.00

  // Dimension Risk Scores
  directIdentifierRiskScore: number;
  quasiIdentifierRiskScore: number;
  uniquenessRiskScore: number;
  combinationRiskScore: number;
  geographicRiskScore: number;
  temporalRiskScore: number;
  linkageRiskScore: number;
  rarityRiskScore: number;
  attributeSensitivityRiskScore: number;

  discoveredAttributeCount: number;
  combinationEvaluatedCount: number;
  warnings: IReidentificationRiskWarning[];
  startedAt: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const warningSchema = new Schema<IReidentificationRiskWarning>(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const reidentificationRiskRunSchema = new Schema<IReidentificationRiskRun>(
  {
    riskRunId: { type: String, required: true, unique: true, index: true },
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
    sanitizedArtifactId: { type: String, required: true, index: true },
    metadataSanitizationRunId: { type: String, default: null },
    sourceChecksum: { type: String, required: true },
    sanitizedChecksum: { type: String, required: true, index: true },
    configurationVersion: { type: String, default: '1.0.0' },
    configurationHash: { type: String, required: true, index: true },
    riskModelVersion: { type: String, default: '1.0.0' },
    referencePopulationVersion: { type: String, default: 'HEURISTIC_1.0' },
    status: {
      type: String,
      enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'],
      default: 'QUEUED',
      required: true,
    },
    isLatestActive: { type: Boolean, default: false },
    requestId: { type: String, default: null },

    reidentificationRiskScore: { type: Number, default: 0.0 },
    riskLevel: {
      type: String,
      enum: ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'CRITICAL'],
      default: 'LOW',
      required: true,
    },
    riskConfidence: { type: Number, default: 1.0 },

    directIdentifierRiskScore: { type: Number, default: 0.0 },
    quasiIdentifierRiskScore: { type: Number, default: 0.0 },
    uniquenessRiskScore: { type: Number, default: 0.0 },
    combinationRiskScore: { type: Number, default: 0.0 },
    geographicRiskScore: { type: Number, default: 0.0 },
    temporalRiskScore: { type: Number, default: 0.0 },
    linkageRiskScore: { type: Number, default: 0.0 },
    rarityRiskScore: { type: Number, default: 0.0 },
    attributeSensitivityRiskScore: { type: Number, default: 0.0 },

    discoveredAttributeCount: { type: Number, default: 0 },
    combinationEvaluatedCount: { type: Number, default: 0 },
    warnings: [warningSchema],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

// 1. Single active risk run per tenant + document
reidentificationRiskRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { name: 'idx_unique_active_risk_run', unique: true, partialFilterExpression: { isLatestActive: true } }
);

// 2. Single running risk analysis job per tenant + document
reidentificationRiskRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { name: 'idx_unique_running_risk_run', unique: true, partialFilterExpression: { status: 'RUNNING' } }
);

// 3. Durable multi-process idempotency identity per tenant + document + sanitizedArtifact + sanitizedChecksum + configurationHash + riskModelVersion
reidentificationRiskRunSchema.index(
  {
    organizationId: 1,
    documentId: 1,
    sanitizedArtifactId: 1,
    sanitizedChecksum: 1,
    configurationHash: 1,
    riskModelVersion: 1,
  },
  {
    name: 'idx_unique_risk_idempotency',
    unique: true,
    partialFilterExpression: { status: { $in: ['QUEUED', 'RUNNING'] } },
  }
);

export const ReidentificationRiskRunModel = mongoose.model<IReidentificationRiskRun>(
  'ReidentificationRiskRun',
  reidentificationRiskRunSchema
);
