import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { DecisionType } from '../config/policyTaxonomy';

export type TransformationRecordOperation = 'REDACT' | 'MUTATE' | 'SKIP_KEEP' | 'SKIP_REVIEW';
export type TransformationRecordStatus = 'APPLIED' | 'SKIPPED' | 'FAILED';

export interface ITransformationRecord extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  transformationRecordId: string;
  transformationRunId: string;
  candidateId: string;
  occurrenceId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  decision: DecisionType;
  operation: TransformationRecordOperation;
  status: TransformationRecordStatus;
  location: {
    pageNumber?: number;
    blockId?: string;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    cellRef?: string;
    containerName?: string;
  };
  syntheticValue?: string;
  failureReason?: string;
  appliedAt: Date;
}

const transformationRecordSchema = new Schema<ITransformationRecord>(
  {
    transformationRecordId: { type: String, required: true, unique: true, index: true },
    transformationRunId: { type: String, required: true, index: true },
    candidateId: { type: String, required: true, index: true },
    occurrenceId: { type: String, required: true },
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
    decision: {
      type: String,
      enum: ['KEEP', 'REVIEW', 'REDACT'],
      required: true,
    },
    operation: {
      type: String,
      enum: ['REDACT', 'MUTATE', 'SKIP_KEEP', 'SKIP_REVIEW'],
      required: true,
    },
    status: {
      type: String,
      enum: ['APPLIED', 'SKIPPED', 'FAILED'],
      required: true,
    },
    location: {
      pageNumber: { type: Number },
      blockId: { type: String },
      boundingBox: {
        x: { type: Number },
        y: { type: Number },
        width: { type: Number },
        height: { type: Number },
      },
      cellRef: { type: String },
      containerName: { type: String },
    },
    syntheticValue: { type: String, default: null },
    failureReason: { type: String, default: null },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const TransformationRecordModel = mongoose.model<ITransformationRecord>(
  'TransformationRecord',
  transformationRecordSchema
);
