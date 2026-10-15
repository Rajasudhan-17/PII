import { api } from './client';
import {
  Policy,
  PoliciesResponse,
  PolicyDetailsResponse,
  CreatePolicyPayload,
  CreatePolicyVersionPayload,
} from '../types/policy';

export const policiesApi = {
  listPolicies: (orgId: string) =>
    api.get<PoliciesResponse>(`/organizations/${orgId}/policies`),

  getPolicy: (orgId: string, policyId: string) =>
    api.get<PolicyDetailsResponse>(`/organizations/${orgId}/policies/${policyId}`),

  createPolicy: (orgId: string, payload: CreatePolicyPayload) =>
    api.post<{ success: boolean; data: { policy: Policy } }>(
      `/organizations/${orgId}/policies`,
      payload
    ),

  createPolicyVersion: (
    orgId: string,
    policyId: string,
    payload: CreatePolicyVersionPayload
  ) =>
    api.post<{ success: boolean; data: { policy: Policy } }>(
      `/organizations/${orgId}/policies/${policyId}/versions`,
      payload
    ),
};
