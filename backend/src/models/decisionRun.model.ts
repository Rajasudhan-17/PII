import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type DecisionRunStatus = 'QUEUED' | 'RUNNING' | 'PARTIAL' | 'COMPLETED' | 'FAILED';

export interface IDecisionRunWarning {
  code: string;
  message: string;
}

export interface IDecisionRunSummary {
  KEEP: number;
  REVIEW: number;
  REDACT: number;
}

export interface IDecisionRun extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  decisionRunId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  detectionRunId: string;
  contextAnalysisRunId: string;
  policyId: string;
  policyVersion: number;
  policyConfigurationHash: string;
  status: DecisionRunStatus;
  isLatestActive: boolean;
  requestId?: string | null;
  totalCandidates: number;
  decisionsSummary: IDecisionRunSummary;
  warnings: IDecisionRunWarning[];
  startedAt: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const warningSchema = new Schema<IDecisionRunWarning>(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const summarySchema = new Schema<IDecisionRunSummary>(
  {
    KEEP: { type: Number, default: 0 },
    REVIEW: { type: Number, default: 0 },
    REDACT: { type: Number, default: 0 },
  },
  { _id: false }
);

const decisionRunSchema = new Schema<IDecisionRun>(
  {
    decisionRunId: { type: String, required: true, unique: true, index: true },
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
    detectionRunId: { type: String, required: true, index: true },
    contextAnalysisRunId: { type: String, required: true, index: true },
    policyId: { type: String, required: true, index: true },
    policyVersion: { type: Number, required: true, default: 1 },
    policyConfigurationHash: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['QUEUED', 'RUNNING', 'PARTIAL', 'COMPLETED', 'FAILED'],
      default: 'QUEUED',
      required: true,
      index: true,
    },
    isLatestActive: { type: Boolean, default: false, index: true },
    requestId: { type: String, default: null, index: true },
    totalCandidates: { type: Number, default: 0 },
    decisionsSummary: {
      type: summarySchema,
      default: () => ({ KEEP: 0, REVIEW: 0, REDACT: 0 }),
    },
    warnings: [warningSchema],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

// 1. Single active completed decision run per tenant + document
decisionRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { name: 'idx_unique_active_run', unique: true, partialFilterExpression: { isLatestActive: true } }
);

// 2. Single running decision evaluation per tenant + document across processes
decisionRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { name: 'idx_unique_running_run', unique: true, partialFilterExpression: { status: 'RUNNING' } }
);

// 3. Request-level idempotency per tenant + document + request ID
decisionRunSchema.index(
  { organizationId: 1, documentId: 1, requestId: 1 },
  { name: 'idx_unique_request_id', unique: true, partialFilterExpression: { requestId: { $type: 'string' } } }
);

// 4. In-flight configuration idempotency per tenant + document
decisionRunSchema.index(
  {
    organizationId: 1,
    documentId: 1,
    detectionRunId: 1,
    contextAnalysisRunId: 1,
    policyConfigurationHash: 1,
  },
  {
    name: 'idx_unique_inflight_run',
    unique: true,
    partialFilterExpression: { status: { $in: ['QUEUED', 'RUNNING'] } },
  }
);

export const DecisionRunModel = mongoose.model<IDecisionRun>(
  'DecisionRun',
  decisionRunSchema
);
