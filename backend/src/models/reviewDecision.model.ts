import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { ISafeEvidenceReference } from './humanReviewCase.model';

export type ReviewDecisionType =
  | 'CONFIRM_FINDING'
  | 'REJECT_FALSE_POSITIVE'
  | 'CONFIRM_REDACTION'
  | 'REPORT_INCOMPLETE_REDACTION'
  | 'REQUEST_REPROCESSING'
  | 'REQUEST_SECOND_REVIEW'
  | 'ESCALATE'
  | 'INSUFFICIENT_EVIDENCE';

export interface IReviewDecision extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  reviewDecisionId: string;
  organizationId: mongoose.Types.ObjectId;
  reviewCaseId: string;
  reviewerId: mongoose.Types.ObjectId;
  decisionType: ReviewDecisionType;
  decisionSequence: number;
  isSecondReview: boolean;
  reasonCode: string;
  safeRationale: string;
  safeEvidenceReferences: ISafeEvidenceReference[];
  expectedNextAction: string;
  caseVersion: number;
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

const reviewDecisionSchema = new Schema<IReviewDecision>(
  {
    reviewDecisionId: { type: String, required: true, unique: true, index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    reviewCaseId: { type: String, required: true, index: true },
    reviewerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    decisionType: {
      type: String,
      enum: [
        'CONFIRM_FINDING',
        'REJECT_FALSE_POSITIVE',
        'CONFIRM_REDACTION',
        'REPORT_INCOMPLETE_REDACTION',
        'REQUEST_REPROCESSING',
        'REQUEST_SECOND_REVIEW',
        'ESCALATE',
        'INSUFFICIENT_EVIDENCE',
      ],
      required: true,
    },
    decisionSequence: { type: Number, default: 1, required: true },
    isSecondReview: { type: Boolean, default: false, required: true },
    reasonCode: { type: String, required: true },
    safeRationale: { type: String, required: true, maxlength: 2000 },
    safeEvidenceReferences: [safeEvidenceSchema],
    expectedNextAction: { type: String, default: 'RESOLVE_CASE' },
    caseVersion: { type: Number, required: true },
  },
  { timestamps: true }
);

reviewDecisionSchema.index({ organizationId: 1, reviewCaseId: 1 });

export const ReviewDecisionModel = mongoose.model<IReviewDecision>(
  'ReviewDecision',
  reviewDecisionSchema
);
