import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type OutputArtifactStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PENDING_REVIEW';

export interface IOutputArtifact extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  outputArtifactId: string;
  organizationId: mongoose.Types.ObjectId;
  sourceDocumentId: mongoose.Types.ObjectId;
  transformationRunId: string;
  sourceChecksum: string;
  outputChecksum: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  status: OutputArtifactStatus;
  createdAt: Date;
  updatedAt: Date;
}

const outputArtifactSchema = new Schema<IOutputArtifact>(
  {
    outputArtifactId: { type: String, required: true, unique: true, index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    sourceDocumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    transformationRunId: { type: String, required: true, index: true },
    sourceChecksum: { type: String, required: true },
    outputChecksum: { type: String, required: true, index: true },
    storageKey: { type: String, required: true },
    originalFilename: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'ARCHIVED', 'DELETED', 'PENDING_REVIEW'],
      default: 'ACTIVE',
      required: true,
    },
  },
  { timestamps: true }
);

export const OutputArtifactModel = mongoose.model<IOutputArtifact>(
  'OutputArtifact',
  outputArtifactSchema
);
