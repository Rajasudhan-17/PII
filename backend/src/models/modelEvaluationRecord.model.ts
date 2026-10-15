import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface IEvaluationMetrics {
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
}

export interface IBaselineComparison {
  baselineModelVersion: string;
  precisionDelta: number;
  recallDelta: number;
  f1Delta: number;
}

export interface IModelEvaluationRecord extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  evaluationRecordId: string;
  organizationId: mongoose.Types.ObjectId;
  datasetVersionId: string;
  targetModelVersion: string;
  targetPolicyVersion: string;
  evaluationConfigurationHash: string;
  metrics: IEvaluationMetrics;
  baselineComparison: IBaselineComparison;
  regressionFindings: string[];
  status: 'COMPLETED' | 'DEFERRED_EXECUTION';
  executionMode: 'SUPPLIED_METRICS' | 'BENCHMARK_EXECUTED';
  evaluatorUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const modelEvaluationRecordSchema = new Schema<IModelEvaluationRecord>(
  {
    evaluationRecordId: { type: String, required: true, unique: true, index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    datasetVersionId: { type: String, required: true, index: true },
    targetModelVersion: { type: String, required: true },
    targetPolicyVersion: { type: String, required: true },
    evaluationConfigurationHash: { type: String, required: true },
    metrics: {
      precision: { type: Number, required: true },
      recall: { type: Number, required: true },
      f1Score: { type: Number, required: true },
      falsePositiveRate: { type: Number, required: true },
      falseNegativeRate: { type: Number, required: true },
    },
    baselineComparison: {
      baselineModelVersion: { type: String, required: true },
      precisionDelta: { type: Number, required: true },
      recallDelta: { type: Number, required: true },
      f1Delta: { type: Number, required: true },
    },
    regressionFindings: [{ type: String }],
    status: {
      type: String,
      enum: ['COMPLETED', 'DEFERRED_EXECUTION'],
      default: 'COMPLETED',
      required: true,
    },
    executionMode: {
      type: String,
      enum: ['SUPPLIED_METRICS', 'BENCHMARK_EXECUTED'],
      default: 'SUPPLIED_METRICS',
      required: true,
    },
    evaluatorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

modelEvaluationRecordSchema.index({ organizationId: 1, datasetVersionId: 1 });

export const ModelEvaluationRecordModel = mongoose.model<IModelEvaluationRecord>(
  'ModelEvaluationRecord',
  modelEvaluationRecordSchema
);
