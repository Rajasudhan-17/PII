/* eslint-disable @typescript-eslint/no-explicit-any */
import { humanReviewService } from '../../src/services/humanReview/humanReview.service';
import { HumanReviewCaseModel, IHumanReviewCase } from '../../src/models/humanReviewCase.model';
import { DocumentModel } from '../../src/models/document.model';
import { ReviewNotificationModel } from '../../src/models/reviewNotification.model';
import mongoose from 'mongoose';

describe('HumanReviewCase Creation & Eligibility Unit Tests', () => {
  const orgId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const docId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.spyOn(ReviewNotificationModel, 'create').mockImplementation(async (data: any) => data as any);
    (jest.spyOn(HumanReviewCaseModel, 'findOne') as any).mockResolvedValue(null);
    (jest.spyOn(DocumentModel, 'findOne') as any).mockImplementation((query: any) => {
      if (query && query._id && query._id.toString() === docId.toString() && query.organizationId && query.organizationId.toString() === orgId.toString()) {
        return Promise.resolve({
          _id: docId,
          organizationId: orgId,
          storageKey: 'storage/test.pdf',
          size: 1024,
          isDeleted: false,
        } as any);
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Creates review case for eligible PARTIAL verification status', async () => {
    const createSpy = jest.spyOn(HumanReviewCaseModel, 'create').mockImplementation(async (data: any) => {
      return {
        reviewCaseId: 'rev_case_123',
        organizationId: orgId,
        documentId: docId,
        caseType: 'PARTIAL_VERIFICATION',
        status: 'OPEN',
        caseVersion: 1,
        assignmentVersion: 1,
        reasonCodes: ['PARTIAL_VERIFICATION_OBSERVED'],
        safeEvidenceReferences: [],
        ...data,
      } as any;
    });

    const res = await humanReviewService.createReviewCase({
      organizationIdStr: orgId.toString(),
      documentIdStr: docId.toString(),
      verificationRunId: 'ver_run_999',
      caseType: 'PARTIAL_VERIFICATION',
      createdByUserIdStr: userId.toString(),
    });

    expect(res.reviewCaseId).toMatch(/^rev_case_/);
    expect(res.caseType).toBe('PARTIAL_VERIFICATION');
    expect(createSpy).toHaveBeenCalled();
    createSpy.mockRestore();
  });

  test('Reuses existing open case for same verificationRunId idempotently', async () => {
    const existingCase = {
      reviewCaseId: 'rev_case_existing',
      organizationId: orgId,
      documentId: docId,
      verificationRunId: 'ver_run_same',
      status: 'OPEN',
    };

    jest.spyOn(HumanReviewCaseModel, 'findOne').mockResolvedValueOnce(existingCase as unknown as IHumanReviewCase);

    const res = await humanReviewService.createReviewCase({
      organizationIdStr: orgId.toString(),
      documentIdStr: docId.toString(),
      verificationRunId: 'ver_run_same',
      caseType: 'PARTIAL_VERIFICATION',
    });

    expect(res.reviewCaseId).toBe('rev_case_existing');
  });

  test('Rejects case creation for non-existent document with 404', async () => {
    const fakeDocId = new mongoose.Types.ObjectId().toString();
    await expect(
      humanReviewService.createReviewCase({
        organizationIdStr: orgId.toString(),
        documentIdStr: fakeDocId,
        caseType: 'AMBIGUOUS_POLICY',
      })
    ).rejects.toThrow('Document not found or deleted');
  });
});
