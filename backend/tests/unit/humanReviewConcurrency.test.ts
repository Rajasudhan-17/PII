/* eslint-disable @typescript-eslint/no-explicit-any */
import { humanReviewService } from '../../src/services/humanReview/humanReview.service';
import { HumanReviewCaseModel, IHumanReviewCase } from '../../src/models/humanReviewCase.model';
import mongoose from 'mongoose';

describe('HumanReview Atomic Claim & Optimistic Concurrency Unit Tests', () => {
  const orgId = new mongoose.Types.ObjectId();
  const reviewer1Id = new mongoose.Types.ObjectId();
  const reviewer2Id = new mongoose.Types.ObjectId();

  test('Reviewer 1 claims case lease atomically for 15 minutes', async () => {
    const mockCase = {
      reviewCaseId: 'rev_case_claim_1',
      organizationId: orgId,
      status: 'ASSIGNED',
      leaseOwnerId: undefined,
      leaseExpiresAt: undefined,
      caseVersion: 1,
      save: jest.fn().mockResolvedValue(true),
    };

    jest.spyOn(HumanReviewCaseModel, 'findOne').mockResolvedValueOnce(mockCase as unknown as IHumanReviewCase);

    const claimedCase = await humanReviewService.claimCaseLease(
      orgId.toString(),
      'rev_case_claim_1',
      reviewer1Id.toString()
    );

    expect(claimedCase.leaseOwnerId).toEqual(reviewer1Id);
    expect(claimedCase.status).toBe('IN_REVIEW');
    expect(claimedCase.leaseExpiresAt).toBeDefined();
    expect(mockCase.save).toHaveBeenCalled();
  });

  test('Reviewer 2 cannot claim active lease held by Reviewer 1 (rejects with 409 Conflict)', async () => {
    const activeLeaseCase = {
      reviewCaseId: 'rev_case_claim_2',
      organizationId: orgId,
      status: 'IN_REVIEW',
      leaseOwnerId: reviewer1Id,
      leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      caseVersion: 2,
    };

    jest.spyOn(HumanReviewCaseModel, 'findOne').mockResolvedValueOnce(activeLeaseCase as unknown as IHumanReviewCase);

    await expect(
      humanReviewService.claimCaseLease(
        orgId.toString(),
        'rev_case_claim_2',
        reviewer2Id.toString()
      )
    ).rejects.toThrow('Case is currently leased by another active reviewer');
  });

  test('Rejects stale decision submission when caseVersion is outdated (409 Conflict)', async () => {
    const mockCase = {
      reviewCaseId: 'rev_case_stale_1',
      organizationId: orgId,
      status: 'IN_REVIEW',
      caseVersion: 3,
    };

    jest.spyOn(HumanReviewCaseModel, 'findOne').mockResolvedValueOnce(mockCase as unknown as IHumanReviewCase);

    await expect(
      humanReviewService.submitReviewDecision({
        organizationIdStr: orgId.toString(),
        reviewCaseIdStr: 'rev_case_stale_1',
        reviewerIdStr: reviewer1Id.toString(),
        decisionType: 'CONFIRM_FINDING',
        reasonCode: 'VALIDATED_FINDING',
        safeRationale: 'Valid finding confirmed by reviewer.',
        caseVersion: 2,
      })
    ).rejects.toThrow('Case version mismatch');
  });

  test('expireLeases recovers expired 15-minute abandoned leases back to OPEN state', async () => {
    (HumanReviewCaseModel.updateMany as any) = jest.fn().mockResolvedValueOnce({ modifiedCount: 2 });

    const count = await humanReviewService.expireLeases(orgId.toString());

    expect(count).toBe(2);
    expect(HumanReviewCaseModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'IN_REVIEW',
      }),
      expect.objectContaining({
        $set: { status: 'OPEN', leaseOwnerId: null, leaseExpiresAt: null },
      })
    );
  });
});
