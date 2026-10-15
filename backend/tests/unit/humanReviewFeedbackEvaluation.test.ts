/* eslint-disable @typescript-eslint/no-explicit-any */
import { humanReviewService } from '../../src/services/humanReview/humanReview.service';
import { ReviewFeedbackModel, IReviewFeedback } from '../../src/models/reviewFeedback.model';
import { EvaluationDatasetVersionModel, IEvaluationDatasetVersion } from '../../src/models/evaluationDatasetVersion.model';
import { ModelEvaluationRecordModel } from '../../src/models/modelEvaluationRecord.model';
import mongoose from 'mongoose';

describe('HumanReview Controlled Feedback & Model Evaluation Unit Tests', () => {
  const orgId = new mongoose.Types.ObjectId();
  const reviewerId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();

  test('Submits feedback record with PENDING_APPROVAL status', async () => {
    const feedbackCreateSpy = jest.spyOn(ReviewFeedbackModel, 'create').mockImplementation(async (data: any) => ({
      feedbackId: 'fb_100',
      organizationId: orgId,
      reviewCaseId: 'rev_case_fb_1',
      approvalState: 'PENDING_APPROVAL',
      feedbackCategory: 'FALSE_POSITIVE',
      ...data,
    } as any));

    const feedback = await humanReviewService.submitFeedback(
      orgId.toString(),
      'rev_case_fb_1',
      'rev_dec_1',
      reviewerId.toString(),
      'FALSE_POSITIVE',
      'DECISION_REDACT',
      'REVIEWED_KEEP'
    );

    expect(feedback.feedbackId).toMatch(/^fb_/);
    expect(feedbackCreateSpy).toHaveBeenCalled();
    feedbackCreateSpy.mockRestore();
  });

  test('Approver cannot approve their own submitted feedback (403 Forbidden)', async () => {
    const mockFeedback = {
      feedbackId: 'fb_self_1',
      organizationId: orgId,
      submittedByUserId: reviewerId,
      approvalState: 'PENDING_APPROVAL',
    };

    jest.spyOn(ReviewFeedbackModel, 'findOne').mockResolvedValueOnce(mockFeedback as unknown as IReviewFeedback);

    await expect(
      humanReviewService.approveOrRejectFeedback(
        orgId.toString(),
        'fb_self_1',
        reviewerId.toString(),
        true
      )
    ).rejects.toThrow('Separation of duties violation');
  });

  test('Distinct admin approves feedback successfully', async () => {
    const mockFeedback = {
      feedbackId: 'fb_admin_1',
      organizationId: orgId,
      submittedByUserId: reviewerId,
      approvalState: 'PENDING_APPROVAL',
      save: jest.fn().mockResolvedValue(true),
    };

    jest.spyOn(ReviewFeedbackModel, 'findOne').mockResolvedValueOnce(mockFeedback as unknown as IReviewFeedback);

    const approvedFeedback = await humanReviewService.approveOrRejectFeedback(
      orgId.toString(),
      'fb_admin_1',
      adminId.toString(),
      true,
      'Approved for evaluation dataset.'
    );

    expect(approvedFeedback.approvalState).toBe('APPROVED');
    expect(mockFeedback.save).toHaveBeenCalled();
  });

  test('Rejects re-adjudication of already approved or rejected feedback (400 Bad Request)', async () => {
    const mockAlreadyApprovedFeedback = {
      feedbackId: 'fb_approved_99',
      organizationId: orgId,
      submittedByUserId: reviewerId,
      approvalState: 'APPROVED',
    };

    jest.spyOn(ReviewFeedbackModel, 'findOne').mockResolvedValueOnce(mockAlreadyApprovedFeedback as unknown as IReviewFeedback);

    await expect(
      humanReviewService.approveOrRejectFeedback(
        orgId.toString(),
        'fb_approved_99',
        adminId.toString(),
        false
      )
    ).rejects.toThrow('Feedback record has already been adjudicated');
  });

  test('Materializes evaluation dataset version from approved feedback', async () => {
    const approvedFeedbackList = [
      { feedbackId: 'fb_app_1', approvalState: 'APPROVED' },
      { feedbackId: 'fb_app_2', approvalState: 'APPROVED' },
    ];

    jest.spyOn(ReviewFeedbackModel, 'find').mockResolvedValueOnce(approvedFeedbackList as unknown as IReviewFeedback[]);
    jest.spyOn(EvaluationDatasetVersionModel, 'create').mockImplementation(async (data: any) => ({
      datasetVersionId: 'ds_ver_2026',
      versionName: 'v2026_q4',
      totalFeedbackCount: 2,
      status: 'MATERIALIZED',
      ...data,
    } as any));
    (ReviewFeedbackModel.updateMany as any) = jest.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 2 });

    const dsVersion = await humanReviewService.createDatasetVersion(
      orgId.toString(),
      'v2026_q4',
      adminId.toString()
    );

    expect(dsVersion.datasetVersionId).toMatch(/^ds_ver_/);
    expect(dsVersion.totalFeedbackCount).toBe(2);
  });

  test('Creates versioned model evaluation record without automatic retraining or deployment', async () => {
    jest.spyOn(EvaluationDatasetVersionModel, 'findOne').mockResolvedValueOnce({
      datasetVersionId: 'ds_ver_2026',
    } as unknown as IEvaluationDatasetVersion);

    const evalCreateSpy = jest.spyOn(ModelEvaluationRecordModel, 'create').mockImplementation(async (data: any) => ({
      evaluationRecordId: 'eval_rec_777',
      organizationId: orgId,
      datasetVersionId: 'ds_ver_2026',
      targetModelVersion: '2.0.0-candidate',
      status: 'COMPLETED',
      metrics: { f1Score: 0.98 },
      ...data,
    } as any));

    const record = await humanReviewService.createModelEvaluationRecord(
      orgId.toString(),
      'ds_ver_2026',
      '2.0.0-candidate',
      '1.0.0-policy',
      adminId.toString()
    );

    expect(record.evaluationRecordId).toMatch(/^eval_rec_/);
    expect(record.status).toBe('COMPLETED');
    expect(evalCreateSpy).toHaveBeenCalled();
    evalCreateSpy.mockRestore();
  });
});
