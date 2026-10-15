import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type ReviewCaseType =
  | 'PARTIAL_VERIFICATION'
  | 'AMBIGUOUS_POLICY'
  | 'CONFLICTING_EVIDENCE'
  | 'HIGH_RISK_REVIEW'
  | 'CAPABILITY_UNAVAILABLE'
  | 'MANUAL_REQUEST';

export type ReviewCasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ReviewCaseSeverity = 'INFO' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ReviewCaseStatus =
  | 'OPEN'
  | 'QUEUED'
  | 'ASSIGNED'
  | 'IN_REVIEW'
  | 'AWAITING_SECOND_REVIEW'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface ISafeEvidenceReference {
  candidateId?: string;
  piiType?: string;
  locationLabel?: string;
  expectedAction?: string;
  observedState?: string;
  findingId?: string;
}

export interface IHumanReviewCase extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  reviewCaseId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  verificationRunId?: string;
  verificationResultIds?: string[];
  sanitizedArtifactId?: string;
  sanitizedArtifactChecksum?: string;
  caseType: ReviewCaseType;
  priority: ReviewCasePriority;
  severity: ReviewCaseSeverity;
  status: ReviewCaseStatus;
  assignedReviewerId?: mongoose.Types.ObjectId;
  assignmentVersion: number;
  leaseOwnerId?: mongoose.Types.ObjectId;
  leaseExpiresAt?: Date;
  reasonCodes: string[];
  safeEvidenceReferences: ISafeEvidenceReference[];
  reviewDeadline?: Date;
  caseVersion: number;
  createdByUserId?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const safeEvidenceSchema = new Schema<ISafeEvidenceReference>(
  {
    candidateId: { type: String },
    piiType: { type: String },
    locationLabel: { type: String },
    expectedAction: { type: String },
    observedState: { type: String },
    findingId: { type: String },
  },
  { _id: false }
);

const humanReviewCaseSchema = new Schema<IHumanReviewCase>(
  {
    reviewCaseId: { type: String, required: true, unique: true, index: true },
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
    verificationRunId: { type: String, index: true },
    verificationResultIds: [{ type: String }],
    sanitizedArtifactId: { type: String },
    sanitizedArtifactChecksum: { type: String },
    caseType: {
      type: String,
      enum: [
        'PARTIAL_VERIFICATION',
        'AMBIGUOUS_POLICY',
        'CONFLICTING_EVIDENCE',
        'HIGH_RISK_REVIEW',
        'CAPABILITY_UNAVAILABLE',
        'MANUAL_REQUEST',
      ],
      default: 'AMBIGUOUS_POLICY',
      required: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM',
      required: true,
    },
    severity: {
      type: String,
      enum: ['INFO', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
      required: true,
    },
    status: {
      type: String,
      enum: [
        'OPEN',
        'QUEUED',
        'ASSIGNED',
        'IN_REVIEW',
        'AWAITING_SECOND_REVIEW',
        'ESCALATED',
        'RESOLVED',
        'REJECTED',
        'CANCELLED',
      ],
      default: 'OPEN',
      required: true,
      index: true,
    },
    assignedReviewerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    assignmentVersion: { type: Number, default: 1, required: true },
    leaseOwnerId: { type: Schema.Types.ObjectId, ref: 'User' },
    leaseExpiresAt: { type: Date },
    reasonCodes: [{ type: String }],
    safeEvidenceReferences: [safeEvidenceSchema],
    reviewDeadline: { type: Date },
    caseVersion: { type: Number, default: 1, required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

humanReviewCaseSchema.index({ organizationId: 1, status: 1 });
humanReviewCaseSchema.index({ organizationId: 1, assignedReviewerId: 1 });
humanReviewCaseSchema.index({ organizationId: 1, documentId: 1 });

export const HumanReviewCaseModel = mongoose.model<IHumanReviewCase>(
  'HumanReviewCase',
  humanReviewCaseSchema
);
