import { api } from './client';
import { PIIDetectionResponse, PIIDetectionSummaryResponse } from '../types/pii';
import { DecisionResponse } from '../types/policy';
import { NormalizedDocumentResponse } from '../types/document';
import { TransformationArtifactsResponse, TransformationRunsResponse } from '../types/transformation';
import { RiskAnalysisResponse, RiskRunsResponse } from '../types/risk';
import { VerificationResultsResponse, VerificationRunsResponse } from '../types/verification';
import { ReviewCasesResponse, SubmitReviewDecisionPayload } from '../types/review';

export const findingsApi = {
  // --- 1. PII Candidates & Detection ---
  getCandidates: (orgId: string, docId: string, runId?: string) =>
    api.get<PIIDetectionResponse>(
      `/organizations/${orgId}/documents/${docId}/pii-detection${runId ? `?runId=${runId}` : ''}`
    ),

  getDetectionSummary: (orgId: string, docId: string) =>
    api.get<PIIDetectionSummaryResponse>(
      `/organizations/${orgId}/documents/${docId}/pii-detection/summary`
    ),

  triggerDetection: (orgId: string, docId: string, options?: { force?: boolean; async?: boolean }) =>
    api.post<PIIDetectionResponse>(
      `/organizations/${orgId}/documents/${docId}/pii-detection`,
      options || {}
    ),

  // --- 2. Normalized Document Extraction Content (Text & Blocks) ---
  getNormalizedContent: (orgId: string, docId: string) =>
    api.get<NormalizedDocumentResponse>(
      `/organizations/${orgId}/documents/${docId}/extraction/content`
    ),

  // --- 3. Contextual Intelligence ---
  getContextResults: (orgId: string, docId: string) =>
    api.get<{ success: boolean; data: { run: unknown; results: unknown[] } }>(
      `/organizations/${orgId}/documents/${docId}/context-analysis/results`
    ),

  triggerContextAnalysis: (orgId: string, docId: string) =>
    api.post<{ success: boolean; data: unknown }>(
      `/organizations/${orgId}/documents/${docId}/context-analysis`
    ),

  // --- 4. Policy Decisions ---
  getDecisions: (orgId: string, docId: string, runId?: string) =>
    api.get<DecisionResponse>(
      `/organizations/${orgId}/documents/${docId}/decisions${runId ? `?runId=${runId}` : ''}`
    ),

  triggerDecisionEvaluation: (orgId: string, docId: string) =>
    api.post<{ success: boolean; data: unknown }>(
      `/organizations/${orgId}/documents/${docId}/decision-evaluation`
    ),

  // --- 5. Redaction & Transformation Artifacts ---
  getTransformationArtifacts: (orgId: string, docId: string, runId?: string) =>
    api.get<TransformationArtifactsResponse>(
      `/organizations/${orgId}/documents/${docId}/transformations/artifacts${runId ? `?runId=${runId}` : ''}`
    ),

  getTransformationRuns: (orgId: string, docId: string) =>
    api.get<TransformationRunsResponse>(
      `/organizations/${orgId}/documents/${docId}/transformations`
    ),

  executeTransformation: (
    orgId: string,
    docId: string,
    payload?: { decisionRunId?: string; operation?: string; force?: boolean }
  ) =>
    api.post<TransformationArtifactsResponse>(
      `/organizations/${orgId}/documents/${docId}/transformations`,
      payload || {}
    ),

  // --- 6. Re-Identification Risk Analysis ---
  getRiskResults: (orgId: string, docId: string) =>
    api.get<RiskAnalysisResponse>(
      `/organizations/${orgId}/documents/${docId}/risk-analysis/results`
    ),

  getRiskRuns: (orgId: string, docId: string) =>
    api.get<RiskRunsResponse>(
      `/organizations/${orgId}/documents/${docId}/risk-analysis/runs`
    ),

  executeRiskAnalysis: (orgId: string, docId: string, options?: { force?: boolean }) =>
    api.post<RiskAnalysisResponse>(
      `/organizations/${orgId}/documents/${docId}/risk-analysis`,
      options || {}
    ),

  // --- 7. Independent Verification ---
  getVerificationResults: (orgId: string, docId: string) =>
    api.get<VerificationResultsResponse>(
      `/organizations/${orgId}/documents/${docId}/verification/results`
    ),

  getVerificationRuns: (orgId: string, docId: string) =>
    api.get<VerificationRunsResponse>(
      `/organizations/${orgId}/documents/${docId}/verification/runs`
    ),

  executeVerification: (orgId: string, docId: string, options?: { force?: boolean }) =>
    api.post<VerificationResultsResponse>(
      `/organizations/${orgId}/documents/${docId}/verification`,
      options || {}
    ),

  // --- 8. Human Review & Adjudication Cases ---
  getReviewCases: (orgId: string, options?: { limit?: number }) =>
    api.get<ReviewCasesResponse>(
      `/organizations/${orgId}/review-cases${options?.limit ? `?limit=${options.limit}` : ''}`
    ),

  submitReviewDecision: (
    orgId: string,
    caseId: string,
    payload: SubmitReviewDecisionPayload
  ) =>
    api.post<{ status: string; data: unknown }>(
      `/organizations/${orgId}/review-cases/${caseId}/decisions`,
      payload
    ),
};
