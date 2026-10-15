import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type NotificationType =
  | 'CASE_ASSIGNED'
  | 'CASE_REASSIGNED'
  | 'DEADLINE_APPROACHING'
  | 'SECOND_REVIEW_REQUESTED'
  | 'CASE_ESCALATED'
  | 'CASE_RESOLVED'
  | 'FEEDBACK_STATUS_CHANGED';

export interface IReviewNotification extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  notificationId: string;
  organizationId: mongoose.Types.ObjectId;
  recipientUserId: mongoose.Types.ObjectId;
  reviewCaseId: string;
  notificationType: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const reviewNotificationSchema = new Schema<IReviewNotification>(
  {
    notificationId: { type: String, required: true, unique: true, index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reviewCaseId: { type: String, required: true, index: true },
    notificationType: {
      type: String,
      enum: [
        'CASE_ASSIGNED',
        'CASE_REASSIGNED',
        'DEADLINE_APPROACHING',
        'SECOND_REVIEW_REQUESTED',
        'CASE_ESCALATED',
        'CASE_RESOLVED',
        'FEEDBACK_STATUS_CHANGED',
      ],
      required: true,
    },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false, required: true },
  },
  { timestamps: true }
);

reviewNotificationSchema.index({ organizationId: 1, recipientUserId: 1, isRead: 1 });

export const ReviewNotificationModel = mongoose.model<IReviewNotification>(
  'ReviewNotification',
  reviewNotificationSchema
);
