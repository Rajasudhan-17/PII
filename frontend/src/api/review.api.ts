import { api } from './client';
import {
  ReviewCasesResponse,
  ReviewCaseDetailsResponse,
  ReviewCasesQuery,
  SubmitReviewDecisionPayload,
  HumanReviewCase,
} from '../types/review';

export const reviewApi = {
  listCases: (orgId: string, query?: ReviewCasesQuery) =>
    api.get<ReviewCasesResponse>(`/organizations/${orgId}/review-cases`, {
      params: query
        ? {
            status: query.status,
            priority: query.priority,
            assignedReviewerId: query.assignedReviewerId,
            page: query.page,
            limit: query.limit,
          }
        : undefined,
    }),

  getCase: (orgId: string, caseId: string) =>
    api.get<ReviewCaseDetailsResponse>(`/organizations/${orgId}/review-cases/${caseId}`),

  claimCase: (orgId: string, caseId: string) =>
    api.post<{ status: string; data: { reviewCase: HumanReviewCase } }>(
      `/organizations/${orgId}/review-cases/${caseId}/claim`
    ),

  assignReviewer: (
    orgId: string,
    caseId: string,
    targetReviewerId: string,
    allowSelfAssignment = false
  ) =>
    api.post<{ status: string; data: { reviewCase: HumanReviewCase } }>(
      `/organizations/${orgId}/review-cases/${caseId}/assign`,
      { targetReviewerId, allowSelfAssignment }
    ),

  submitDecision: (orgId: string, caseId: string, payload: SubmitReviewDecisionPayload) =>
    api.post<{ status: string; data: { reviewCase: HumanReviewCase; decision: unknown } }>(
      `/organizations/${orgId}/review-cases/${caseId}/decisions`,
      payload
    ),
};
