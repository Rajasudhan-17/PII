/* eslint-disable @typescript-eslint/no-explicit-any */
import { humanReviewService } from '../../src/services/humanReview/humanReview.service';
import { HumanReviewCaseModel, IHumanReviewCase } from '../../src/models/humanReviewCase.model';
import { ReviewDecisionModel } from '../../src/models/reviewDecision.model';
import mongoose from 'mongoose';

describe('HumanReview Decision & Second Review Adjudication Unit Tests', () => {
  const orgId = new mongoose.Types.ObjectId();
  const reviewer1Id = new mongoose.Types.ObjectId();
  const reviewer2Id = new mongoose.Types.ObjectId();

  test('Submits decision and sanitizes script tags from reviewer notes', async () => {
    const mockCase = {
      reviewCaseId: 'rev_case_dec_1',
      organizationId: orgId,
      status: 'IN_REVIEW',
      caseVersion: 1,
      save: jest.fn().mockResolvedValue(true),
    };

    jest.spyOn(HumanReviewCaseModel, 'findOne').mockResolvedValueOnce(mockCase as unknown as IHumanReviewCase);
    jest.spyOn(ReviewDecisionModel, 'find').mockImplementation(() => ({
      sort: jest.fn().mockResolvedValue([]),
    }) as any);

    const decisionCreateSpy = jest.spyOn(ReviewDecisionModel, 'create').mockImplementation(async (data: any) => ({
      reviewDecisionId: 'rev_dec_1',
      organizationId: orgId,
      reviewCaseId: 'rev_case_dec_1',
      reviewerId: reviewer1Id,
      decisionType: 'CONFIRM_FINDING',
      decisionSequence: 1,
      safeRationale: 'Clean note here',
      caseVersion: 1,
      ...data,
    } as any));

    const result = await humanReviewService.submitReviewDecision({
      organizationIdStr: orgId.toString(),
      reviewCaseIdStr: 'rev_case_dec_1',
      reviewerIdStr: reviewer1Id.toString(),
      decisionType: 'CONFIRM_FINDING',
      reasonCode: 'VALIDATED',
      safeRationale: '<script>alert("xss")</script>Clean note here',
      caseVersion: 1,
    });

    expect(result.reviewCase.status).toBe('RESOLVED');
    expect(decisionCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safeRationale: expect.not.stringContaining('<script>'),
      })
    );

    decisionCreateSpy.mockRestore();
  });

  test('Requesting second review transitions case status to AWAITING_SECOND_REVIEW', async () => {
    const mockCase = {
      reviewCaseId: 'rev_case_dec_2',
      organizationId: orgId,
      status: 'IN_REVIEW',
      caseVersion: 1,
      save: jest.fn().mockResolvedValue(true),
    };

    jest.spyOn(HumanReviewCaseModel, 'findOne').mockResolvedValueOnce(mockCase as unknown as IHumanReviewCase);
    jest.spyOn(ReviewDecisionModel, 'find').mockImplementation(() => ({
      sort: jest.fn().mockResolvedValue([]),
    }) as any);
    jest.spyOn(ReviewDecisionModel, 'create').mockImplementation(async (data: any) => data as any);

    const result = await humanReviewService.submitReviewDecision({
      organizationIdStr: orgId.toString(),
      reviewCaseIdStr: 'rev_case_dec_2',
      reviewerIdStr: reviewer1Id.toString(),
      decisionType: 'REQUEST_SECOND_REVIEW',
      reasonCode: 'AMBIGUOUS_BOUNDS',
      safeRationale: 'Requires second review due to overlapping entity bounds.',
      caseVersion: 1,
    });

    expect(result.reviewCase.status).toBe('AWAITING_SECOND_REVIEW');
  });

  test('Second review by same reviewer (reviewer1) fails due to self-approval prevention (403 Forbidden)', async () => {
    const mockCase = {
      reviewCaseId: 'rev_case_dec_3',
      organizationId: orgId,
      status: 'AWAITING_SECOND_REVIEW',
      caseVersion: 2,
    };

    const firstDecision = {
      reviewDecisionId: 'rev_dec_first',
      decisionSequence: 1,
      reviewerId: reviewer1Id,
    };

    jest.spyOn(HumanReviewCaseModel, 'findOne').mockResolvedValueOnce(mockCase as unknown as IHumanReviewCase);
    jest.spyOn(ReviewDecisionModel, 'find').mockImplementation(() => ({
      sort: jest.fn().mockResolvedValue([firstDecision]),
    }) as any);

    await expect(
      humanReviewService.submitReviewDecision({
        organizationIdStr: orgId.toString(),
        reviewCaseIdStr: 'rev_case_dec_3',
        reviewerIdStr: reviewer1Id.toString(),
        decisionType: 'CONFIRM_REDACTION',
        reasonCode: 'SECOND_APPROVAL',
        safeRationale: 'Self approval attempt.',
        caseVersion: 2,
      })
    ).rejects.toThrow('Self-approval policy violation');
  });

  test('Second review by distinct reviewer (reviewer2) succeeds and resolves case', async () => {
    const mockCase = {
      reviewCaseId: 'rev_case_dec_4',
      organizationId: orgId,
      status: 'AWAITING_SECOND_REVIEW',
      caseVersion: 2,
      save: jest.fn().mockResolvedValue(true),
    };

    const firstDecision = {
      reviewDecisionId: 'rev_dec_first',
      decisionSequence: 1,
      reviewerId: reviewer1Id,
    };

    jest.spyOn(HumanReviewCaseModel, 'findOne').mockResolvedValueOnce(mockCase as unknown as IHumanReviewCase);
    jest.spyOn(ReviewDecisionModel, 'find').mockImplementation(() => ({
      sort: jest.fn().mockResolvedValue([firstDecision]),
    }) as any);
    jest.spyOn(ReviewDecisionModel, 'create').mockImplementation(async (data: any) => data as any);

    const result = await humanReviewService.submitReviewDecision({
      organizationIdStr: orgId.toString(),
      reviewCaseIdStr: 'rev_case_dec_4',
      reviewerIdStr: reviewer2Id.toString(),
      decisionType: 'CONFIRM_REDACTION',
      reasonCode: 'SECOND_APPROVAL_CONFIRMED',
      safeRationale: 'Second review confirmed redaction accuracy.',
      caseVersion: 2,
    });

    expect(result.reviewCase.status).toBe('RESOLVED');
  });
});
