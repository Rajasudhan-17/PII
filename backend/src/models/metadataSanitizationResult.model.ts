import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type MetadataCategory =
  | 'PDF_METADATA'
  | 'OFFICE_CORE_PROPERTIES'
  | 'OFFICE_CUSTOM_PROPERTIES'
  | 'OFFICE_COMMENTS'
  | 'OFFICE_TRACKING'
  | 'OFFICE_HIDDEN_CONTENT'
  | 'OFFICE_EMBEDDED_OBJECT'
  | 'SPREADSHEET_HIDDEN_CONTENT'
  | 'PRESENTATION_NOTES'
  | 'IMAGE_EXIF'
  | 'IMAGE_GPS'
  | 'IMAGE_DEVICE_METADATA'
  | 'FILENAME_METADATA'
  | 'EMBEDDED_METADATA'
  | 'UNKNOWN_METADATA';

export type MetadataClassification = 'REMOVE' | 'PRESERVE' | 'POLICY_CONTROLLED' | 'UNSUPPORTED';
export type MetadataSanitizationAction = 'REMOVE' | 'PRESERVE' | 'SANITIZE' | 'REVIEW' | 'REJECT';
export type MetadataRecordStatus = 'SANITIZED' | 'PRESERVED' | 'SKIPPED' | 'UNSUPPORTED' | 'FAILED';

export interface IMetadataSanitizationResult extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  sanitizationRecordId: string;
  sanitizationRunId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  category: MetadataCategory;
  targetPath: string; // e.g. "docInfo.Author", "exif.GPSLatitude", "core.xml/dc:creator"
  classification: MetadataClassification;
  action: MetadataSanitizationAction;
  status: MetadataRecordStatus;
  reason?: string | null;
  sanitizerVersion: string;
  appliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const metadataSanitizationResultSchema = new Schema<IMetadataSanitizationResult>(
  {
    sanitizationRecordId: { type: String, required: true, unique: true, index: true },
    sanitizationRunId: { type: String, required: true, index: true },
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
    category: {
      type: String,
      enum: [
        'PDF_METADATA',
        'OFFICE_CORE_PROPERTIES',
        'OFFICE_CUSTOM_PROPERTIES',
        'OFFICE_COMMENTS',
        'OFFICE_TRACKING',
        'OFFICE_HIDDEN_CONTENT',
        'OFFICE_EMBEDDED_OBJECT',
        'SPREADSHEET_HIDDEN_CONTENT',
        'PRESENTATION_NOTES',
        'IMAGE_EXIF',
        'IMAGE_GPS',
        'IMAGE_DEVICE_METADATA',
        'FILENAME_METADATA',
        'EMBEDDED_METADATA',
        'UNKNOWN_METADATA',
      ],
      required: true,
    },
    targetPath: { type: String, required: true },
    classification: {
      type: String,
      enum: ['REMOVE', 'PRESERVE', 'POLICY_CONTROLLED', 'UNSUPPORTED'],
      required: true,
    },
    action: {
      type: String,
      enum: ['REMOVE', 'PRESERVE', 'SANITIZE', 'REVIEW', 'REJECT'],
      required: true,
    },
    status: {
      type: String,
      enum: ['SANITIZED', 'PRESERVED', 'SKIPPED', 'UNSUPPORTED', 'FAILED'],
      required: true,
    },
    reason: { type: String, default: null },
    sanitizerVersion: { type: String, default: '1.0.0' },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const MetadataSanitizationResultModel = mongoose.model<IMetadataSanitizationResult>(
  'MetadataSanitizationResult',
  metadataSanitizationResultSchema
);
