import { humanReviewService } from '../../src/services/humanReview/humanReview.service';
import { HumanReviewCaseModel, IHumanReviewCase } from '../../src/models/humanReviewCase.model';
import { OrganizationMembership, IOrganizationMembership } from '../../src/models/membership.model';
import { ReviewNotificationModel } from '../../src/models/reviewNotification.model';
import mongoose from 'mongoose';

describe('HumanReview Assignment & Conflict-of-Interest Unit Tests', () => {
  const orgId = new mongoose.Types.ObjectId();
  const creatorUserId = new mongoose.Types.ObjectId();
  const reviewerUserId = new mongoose.Types.ObjectId();
  const adminUserId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(ReviewNotificationModel, 'create').mockImplementation(async (data: any) => data as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Assigns reviewer successfully when reviewer is active organization member', async () => {
    jest.spyOn(OrganizationMembership, 'findOne').mockResolvedValueOnce({
      organizationId: orgId,
      userId: reviewerUserId,
      status: 'ACTIVE',
    } as unknown as IOrganizationMembership);

    const mockCase = {
      reviewCaseId: 'rev_case_assign_1',
      organizationId: orgId,
      createdByUserId: creatorUserId,
      assignedReviewerId: undefined,
      assignmentVersion: 1,
      caseVersion: 1,
      status: 'OPEN',
      save: jest.fn().mockResolvedValue(true),
    };

    jest.spyOn(HumanReviewCaseModel, 'findOne').mockResolvedValueOnce(mockCase as unknown as IHumanReviewCase);

    const updatedCase = await humanReviewService.assignReviewer(
      orgId.toString(),
      'rev_case_assign_1',
      reviewerUserId.toString(),
      adminUserId.toString()
    );

    expect(updatedCase.assignedReviewerId).toEqual(reviewerUserId);
    expect(updatedCase.status).toBe('ASSIGNED');
    expect(updatedCase.assignmentVersion).toBe(2);
    expect(mockCase.save).toHaveBeenCalled();
  });

  test('Rejects assignment if target reviewer is not an active organization member', async () => {
    jest.spyOn(OrganizationMembership, 'findOne').mockResolvedValueOnce(null);

    await expect(
      humanReviewService.assignReviewer(
        orgId.toString(),
        'rev_case_assign_1',
        reviewerUserId.toString(),
        adminUserId.toString()
      )
    ).rejects.toThrow('Target reviewer is not an active member of this organization');
  });

  test('Enforces Conflict-of-Interest policy preventing creator self-assignment', async () => {
    jest.spyOn(OrganizationMembership, 'findOne').mockResolvedValueOnce({
      organizationId: orgId,
      userId: creatorUserId,
      status: 'ACTIVE',
    } as unknown as IOrganizationMembership);

    const mockCase = {
      reviewCaseId: 'rev_case_assign_2',
      organizationId: orgId,
      createdByUserId: creatorUserId,
      assignedReviewerId: undefined,
      assignmentVersion: 1,
      caseVersion: 1,
      status: 'OPEN',
    };

    jest.spyOn(HumanReviewCaseModel, 'findOne').mockResolvedValueOnce(mockCase as unknown as IHumanReviewCase);

    await expect(
      humanReviewService.assignReviewer(
        orgId.toString(),
        'rev_case_assign_2',
        creatorUserId.toString(),
        creatorUserId.toString(),
        false
      )
    ).rejects.toThrow('Conflict-of-interest policy prevents creator from being assigned as reviewer for this case');
  });
});
