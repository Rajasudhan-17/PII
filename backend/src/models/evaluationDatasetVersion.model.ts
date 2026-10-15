import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type DatasetVersionStatus = 'DRAFT' | 'MATERIALIZED' | 'DEPRECATED';

export interface IEvaluationDatasetVersion extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  datasetVersionId: string;
  organizationId: mongoose.Types.ObjectId;
  versionName: string;
  feedbackIds: string[];
  totalFeedbackCount: number;
  status: DatasetVersionStatus;
  createdByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const evaluationDatasetVersionSchema = new Schema<IEvaluationDatasetVersion>(
  {
    datasetVersionId: { type: String, required: true, unique: true, index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    versionName: { type: String, required: true },
    feedbackIds: [{ type: String, required: true }],
    totalFeedbackCount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'MATERIALIZED', 'DEPRECATED'],
      default: 'MATERIALIZED',
      required: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

evaluationDatasetVersionSchema.index({ organizationId: 1, versionName: 1 });

export const EvaluationDatasetVersionModel = mongoose.model<IEvaluationDatasetVersion>(
  'EvaluationDatasetVersion',
  evaluationDatasetVersionSchema
);
