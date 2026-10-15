import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type ContextAnalysisRunStatus = 'QUEUED' | 'RUNNING' | 'PARTIAL' | 'COMPLETED' | 'FAILED';

export interface IContextAnalysisRunWarning {
  code: string;
  message: string;
}

export interface IContextAnalysisRun extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  contextAnalysisRunId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  detectionRunId: string;
  documentChecksum: string;
  normalizedDocumentVersion: string;
  contextConfigurationVersion: string;
  contextConfigurationHash: string;
  status: ContextAnalysisRunStatus;
  isLatestActive: boolean;
  candidateCount: number;
  processedCount: number;
  warnings: IContextAnalysisRunWarning[];
  startedAt: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const warningSchema = new Schema<IContextAnalysisRunWarning>(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const contextAnalysisRunSchema = new Schema<IContextAnalysisRun>(
  {
    contextAnalysisRunId: { type: String, required: true, unique: true, index: true },
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
    documentChecksum: { type: String, required: true },
    normalizedDocumentVersion: { type: String, required: true, default: '1.0.0' },
    contextConfigurationVersion: { type: String, required: true, default: '1.0.0' },
    contextConfigurationHash: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['QUEUED', 'RUNNING', 'PARTIAL', 'COMPLETED', 'FAILED'],
      default: 'QUEUED',
      required: true,
      index: true,
    },
    isLatestActive: { type: Boolean, default: false, index: true },
    candidateCount: { type: Number, default: 0 },
    processedCount: { type: Number, default: 0 },
    warnings: [warningSchema],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

// Unique latest active context run per document
contextAnalysisRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { unique: true, partialFilterExpression: { isLatestActive: true } }
);

// Unique in-flight context run for same detection run and configuration hash
contextAnalysisRunSchema.index(
  {
    organizationId: 1,
    documentId: 1,
    detectionRunId: 1,
    contextConfigurationHash: 1,
  },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['QUEUED', 'RUNNING'] } },
  }
);

contextAnalysisRunSchema.index({
  organizationId: 1,
  documentId: 1,
  detectionRunId: 1,
  status: 1,
});

export const ContextAnalysisRunModel = mongoose.model<IContextAnalysisRun>(
  'ContextAnalysisRun',
  contextAnalysisRunSchema
);
