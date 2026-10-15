import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type DocumentStatus =
  | 'QUARANTINED'
  | 'VALIDATING'
  | 'READY'
  | 'EXTRACTION_QUEUED'
  | 'EXTRACTING'
  | 'EXTRACTED'
  | 'EXTRACTION_PARTIAL'
  | 'EXTRACTION_FAILED'
  | 'OCR_REQUIRED'
  | 'OCR_QUEUED'
  | 'OCR_PROCESSING'
  | 'OCR_COMPLETED'
  | 'OCR_FAILED'
  | 'ENCRYPTED'
  | 'REJECTED'
  | 'DELETED';

export interface IDocument extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  uploadedBy: mongoose.Types.ObjectId;
  originalFilename: string;
  size: number;
  declaredMimeType: string;
  detectedMimeType: string;
  extension: string;
  storageKey: string;
  status: DocumentStatus;
  checksum: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    originalFilename: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    declaredMimeType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    detectedMimeType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    extension: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    storageKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        'QUARANTINED',
        'VALIDATING',
        'READY',
        'EXTRACTION_QUEUED',
        'EXTRACTING',
        'EXTRACTED',
        'EXTRACTION_PARTIAL',
        'EXTRACTION_FAILED',
        'OCR_REQUIRED',
        'OCR_QUEUED',
        'OCR_PROCESSING',
        'OCR_COMPLETED',
        'OCR_FAILED',
        'ENCRYPTED',
        'REJECTED',
        'DELETED',
      ],
      default: 'QUARANTINED',
      required: true,
      index: true,
    },
    checksum: {
      type: String,
      required: true,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for tenant isolation queries
documentSchema.index({ organizationId: 1, _id: 1 });
documentSchema.index({ organizationId: 1, isDeleted: 1, createdAt: -1 });

export const DocumentModel = mongoose.model<IDocument>('Document', documentSchema);
