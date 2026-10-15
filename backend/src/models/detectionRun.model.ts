import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type DetectionRunStatus = 'QUEUED' | 'RUNNING' | 'PARTIAL' | 'COMPLETED' | 'FAILED';

export interface IDetectionRunWarning {
  code: string;
  message: string;
}

export interface IDetectionRun extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  detectionRunId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  documentChecksum: string;
  normalizedDocumentVersion: string;
  detectorConfigurationVersion: string;
  detectorConfigurationHash: string;
  status: DetectionRunStatus;
  isLatestActive: boolean;
  candidateCount: number;
  warnings: IDetectionRunWarning[];
  startedAt: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const warningSchema = new Schema<IDetectionRunWarning>(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const detectionRunSchema = new Schema<IDetectionRun>(
  {
    detectionRunId: { type: String, required: true, unique: true, index: true },
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
    documentChecksum: { type: String, required: true },
    normalizedDocumentVersion: { type: String, required: true, default: '1.0.0' },
    detectorConfigurationVersion: { type: String, required: true, default: '1.0.0' },
    detectorConfigurationHash: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['QUEUED', 'RUNNING', 'PARTIAL', 'COMPLETED', 'FAILED'],
      default: 'QUEUED',
      required: true,
      index: true,
    },
    isLatestActive: { type: Boolean, default: false, index: true },
    candidateCount: { type: Number, default: 0 },
    warnings: [warningSchema],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

detectionRunSchema.index(
  { organizationId: 1, documentId: 1 },
  { unique: true, partialFilterExpression: { isLatestActive: true } }
);

detectionRunSchema.index(
  {
    organizationId: 1,
    documentId: 1,
    documentChecksum: 1,
    normalizedDocumentVersion: 1,
    detectorConfigurationHash: 1,
  },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['QUEUED', 'RUNNING'] } },
  }
);

detectionRunSchema.index({
  organizationId: 1,
  documentId: 1,
  documentChecksum: 1,
  detectorConfigurationHash: 1,
  status: 1,
});

export const DetectionRunModel = mongoose.model<IDetectionRun>(
  'DetectionRun',
  detectionRunSchema
);
