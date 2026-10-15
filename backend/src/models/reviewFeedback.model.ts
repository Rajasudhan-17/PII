import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type FeedbackCategory =
  | 'FALSE_POSITIVE'
  | 'FALSE_NEGATIVE'
  | 'INCORRECT_BOUNDS'
  | 'POLICY_MISMATCH'
  | 'CORRECT_CONFIRMATION';

export type FeedbackApprovalState =
  | 'COLLECTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

export interface IReviewFeedback extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  feedbackId: string;
  organizationId: mongoose.Types.ObjectId;
  reviewCaseId: string;
  reviewDecisionId: string;
  sourceDecisionReference: string;
  reviewedOutcome: string;
  feedbackCategory: FeedbackCategory;
  approvalState: FeedbackApprovalState;
  datasetVersion?: string;
  submittedByUserId: mongoose.Types.ObjectId;
  approvedByUserId?: mongoose.Types.ObjectId;
  approvalNotes?: string;
  approvedAt?: Date;
  provenance: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const reviewFeedbackSchema = new Schema<IReviewFeedback>(
  {
    feedbackId: { type: String, required: true, unique: true, index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    reviewCaseId: { type: String, required: true, index: true },
    reviewDecisionId: { type: String, required: true, index: true },
    sourceDecisionReference: { type: String, required: true },
    reviewedOutcome: { type: String, required: true },
    feedbackCategory: {
      type: String,
      enum: [
        'FALSE_POSITIVE',
        'FALSE_NEGATIVE',
        'INCORRECT_BOUNDS',
        'POLICY_MISMATCH',
        'CORRECT_CONFIRMATION',
      ],
      required: true,
    },
    approvalState: {
      type: String,
      enum: ['COLLECTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'],
      default: 'PENDING_APPROVAL',
      required: true,
      index: true,
    },
    datasetVersion: { type: String, index: true },
    submittedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    approvalNotes: { type: String, maxlength: 1000 },
    approvedAt: { type: Date },
    provenance: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

reviewFeedbackSchema.index({ organizationId: 1, approvalState: 1 });

export const ReviewFeedbackModel = mongoose.model<IReviewFeedback>(
  'ReviewFeedback',
  reviewFeedbackSchema
);
