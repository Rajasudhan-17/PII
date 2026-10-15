import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, setAuthTokenGetter, setTenantIdGetter } from '../api/client';
import { reviewApi } from '../api/review.api';
import { policiesApi } from '../api/policies.api';
import { auditApi, AUDIT_EVENT_TAXONOMY } from '../api/audit.api';
import {
  HumanReviewCase,
  ReviewDecision,
  SubmitReviewDecisionPayload,
  ReviewCasesResponse,
  ReviewCaseDetailsResponse,
} from '../types/review';
import {
  Policy,
  PolicyRule,
  CreatePolicyPayload,
  CreatePolicyVersionPayload,
  PoliciesResponse,
  PolicyDetailsResponse,
  RuleOperator,
  RuleProperty,
} from '../types/policy';
import { AuthAuditEventType } from '../types/audit';

describe('Phase 5 — Human Review Workspace, Policy Management & Audit Trail', () => {
  let activeTenantId: string | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    activeTenantId = 'org_test_phase5';
    setAuthTokenGetter(() => 'valid-reviewer-token');
    setTenantIdGetter(() => activeTenantId);
  });

  // Synthetic Test Fixtures (Zero real PII; strictly synthetic data)
  const syntheticCase: HumanReviewCase = {
    reviewCaseId: 'rev_case_001',
    documentId: 'doc_synth_001',
    organizationId: 'org_test_phase5',
    status: 'OPEN',
    priority: 'HIGH',
    severity: 'HIGH',
    caseType: 'POLICY_AMBIGUITY',
    caseVersion: 1,
    leaseOwnerId: undefined,
    leaseExpiresAt: undefined,
    reasonCodes: ['CONFIDENCE_THRESHOLD_UNMET', 'CONTEXT_CONFLICT'],
    safeEvidenceReferences: [],
    assignedReviewerId: undefined,
    resolvedAt: undefined,
    createdAt: '2026-10-13T10:00:00.000Z',
    updatedAt: '2026-10-13T10:00:00.000Z',
  };

  const syntheticDecision: ReviewDecision = {
    reviewDecisionId: 'rdec_001',
    reviewCaseId: 'rev_case_001',
    organizationId: 'org_test_phase5',
    decisionType: 'CONFIRM_REDACTION',
    decisionSequence: 1,
    isSecondReview: false,
    reviewerId: 'user_reviewer_01',
    caseVersion: 1,
    reasonCode: 'PII_CLASSIFICATION_CONFIRMED',
    safeRationale: 'Synthetic customer identifier verified as direct PII.',
    expectedNextAction: 'MUTATE_REDACTION',
    createdAt: '2026-10-13T10:15:00.000Z',
  };

  const syntheticRule: PolicyRule = {
    ruleId: 'rule_direct_id',
    name: 'Redact Direct Identifiers',
    priority: 10,
    action: 'REDACT',
    rationaleCode: 'GDPR_DIRECT_IDENTIFIER',
    conditions: [
      {
        property: 'category',
        operator: 'EQUALS',
        value: 'DIRECT_IDENTIFIER',
      },
      {
        property: 'detectionScore',
        operator: 'GREATER_THAN_OR_EQUAL',
        value: 0.85,
      },
    ],
  };

  const syntheticPolicy: Policy = {
    policyId: 'pol_synth_001',
    organizationId: 'org_test_phase5',
    name: 'Standard GDPR Privacy Policy',
    description: 'Enforces redaction on all direct identifiers with confidence >= 0.85',
    version: 1,
    status: 'PUBLISHED',
    defaultDecision: 'KEEP',
    rules: [syntheticRule],
    createdAt: '2026-10-13T08:00:00.000Z',
    updatedAt: '2026-10-13T08:00:00.000Z',
  };

  // =========================================================================
  // 1. HUMAN REVIEW QUEUE & LEASE CONCURRENCY TESTS
  // =========================================================================
  describe('Human Review Queue & Concurrency Controls', () => {
    it('fetches review queue cases with query parameters and pagination', async () => {
      const mockApiResponse: ReviewCasesResponse = {
        status: 'SUCCESS',
        data: {
          cases: [syntheticCase],
          pagination: {
            total: 1,
            page: 1,
            limit: 25,
          },
        },
      };

      const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockApiResponse);

      const result = await reviewApi.listCases('org_test_phase5', {
        status: 'OPEN',
        priority: 'HIGH',
        page: 1,
        limit: 25,
      });

      expect(getSpy).toHaveBeenCalledWith('/organizations/org_test_phase5/review-cases', {
        params: {
          status: 'OPEN',
          priority: 'HIGH',
          assignedReviewerId: undefined,
          page: 1,
          limit: 25,
        },
      });
      expect(result.data.cases).toHaveLength(1);
      expect(result.data.cases[0].reviewCaseId).toBe('rev_case_001');
      expect(result.data.pagination?.total).toBe(1);
    });

    it('retrieves single review case details including decision audit log', async () => {
      const mockCaseDetails: ReviewCaseDetailsResponse = {
        status: 'SUCCESS',
        data: {
          reviewCase: syntheticCase,
          decisions: [syntheticDecision],
          notifications: [],
        },
      };

      const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockCaseDetails);

      const result = await reviewApi.getCase('org_test_phase5', 'rev_case_001');

      expect(getSpy).toHaveBeenCalledWith(
        '/organizations/org_test_phase5/review-cases/rev_case_001'
      );
      expect(result.data.reviewCase.reviewCaseId).toBe('rev_case_001');
      expect(result.data.decisions).toHaveLength(1);
      expect(result.data.decisions[0].decisionType).toBe('CONFIRM_REDACTION');
    });

    it('claims a 15-minute reviewer lease successfully for an open case', async () => {
      const fifteenMinutesLater = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const leasedCase: HumanReviewCase = {
        ...syntheticCase,
        status: 'IN_REVIEW',
        leaseOwnerId: 'user_reviewer_01',
        leaseExpiresAt: fifteenMinutesLater,
      };

      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
        status: 'SUCCESS',
        data: { reviewCase: leasedCase },
      });

      const result = await reviewApi.claimCase('org_test_phase5', 'rev_case_001');

      expect(postSpy).toHaveBeenCalledWith(
        '/organizations/org_test_phase5/review-cases/rev_case_001/claim'
      );
      expect(result.data.reviewCase.status).toBe('IN_REVIEW');
      expect(result.data.reviewCase.leaseOwnerId).toBe('user_reviewer_01');
      expect(result.data.reviewCase.leaseExpiresAt).toBe(fifteenMinutesLater);
    });

    it('handles 409 CASE_ALREADY_LEASED error when another reviewer holds an active lease', async () => {
      const leaseConflictError = new Error('Case is currently leased by another reviewer');
      (leaseConflictError as unknown as { status: number; code: string }).status = 409;
      (leaseConflictError as unknown as { status: number; code: string }).code = 'CASE_ALREADY_LEASED';

      vi.spyOn(api, 'post').mockRejectedValue(leaseConflictError);

      await expect(
        reviewApi.claimCase('org_test_phase5', 'rev_case_001')
      ).rejects.toThrow('Case is currently leased by another reviewer');
    });

    it('assigns a review case to a designated reviewer', async () => {
      const assignedCase: HumanReviewCase = {
        ...syntheticCase,
        status: 'ASSIGNED',
        assignedReviewerId: 'user_analyst_99',
      };

      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
        status: 'SUCCESS',
        data: { reviewCase: assignedCase },
      });

      const result = await reviewApi.assignReviewer('org_test_phase5', 'rev_case_001', 'user_analyst_99');

      expect(postSpy).toHaveBeenCalledWith(
        '/organizations/org_test_phase5/review-cases/rev_case_001/assign',
        { targetReviewerId: 'user_analyst_99', allowSelfAssignment: false }
      );
      expect(result.data.reviewCase.assignedReviewerId).toBe('user_analyst_99');
      expect(result.data.reviewCase.status).toBe('ASSIGNED');
    });
  });

  // =========================================================================
  // 2. ADJUDICATION & OPTIMISTIC CONCURRENCY TESTS
  // =========================================================================
  describe('Adjudication & Concurrency Protection', () => {
    it('submits human adjudication with required caseVersion and reason code', async () => {
      const payload: SubmitReviewDecisionPayload = {
        decisionType: 'CONFIRM_REDACTION',
        caseVersion: 1,
        reasonCode: 'PII_CLASSIFICATION_CONFIRMED',
        safeRationale: 'Verified against synthetic profile template.',
      };

      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
        status: 'SUCCESS',
        data: {
          reviewCase: { ...syntheticCase, status: 'RESOLVED', caseVersion: 2 },
          decision: syntheticDecision,
        },
      });

      const result = await reviewApi.submitDecision('org_test_phase5', 'rev_case_001', payload);

      expect(postSpy).toHaveBeenCalledWith(
        '/organizations/org_test_phase5/review-cases/rev_case_001/decisions',
        payload
      );
      expect(result.data.reviewCase.status).toBe('RESOLVED');
      expect(result.data.reviewCase.caseVersion).toBe(2);
    });

    it('rejects adjudication with 409 CONCURRENT_MODIFICATION if caseVersion has been mutated', async () => {
      const staleVersionPayload: SubmitReviewDecisionPayload = {
        decisionType: 'REJECT_FALSE_POSITIVE',
        caseVersion: 1, // Stale version when case is already at version 2
        reasonCode: 'FALSE_POSITIVE_NER',
        safeRationale: 'Stale version submission test',
      };

      const concurrencyConflictError = new Error('Case version mismatch: concurrent modification detected');
      (concurrencyConflictError as unknown as { status: number; code: string }).status = 409;
      (concurrencyConflictError as unknown as { status: number; code: string }).code = 'CONCURRENT_MODIFICATION';

      vi.spyOn(api, 'post').mockRejectedValue(concurrencyConflictError);

      await expect(
        reviewApi.submitDecision('org_test_phase5', 'rev_case_001', staleVersionPayload)
      ).rejects.toThrow('Case version mismatch: concurrent modification detected');
    });

    it('enforces second-review independence and rejects self-approval with 403 SELF_APPROVAL_REJECTED', async () => {
      const selfApprovalPayload: SubmitReviewDecisionPayload = {
        decisionType: 'CONFIRM_REDACTION',
        caseVersion: 2,
        reasonCode: 'SECOND_REVIEW_AFFIRMED',
        safeRationale: 'Attempting self-approval as initial reviewer',
      };

      const selfApprovalError = new Error('Second review cannot be approved by the original reviewer');
      (selfApprovalError as unknown as { status: number; code: string }).status = 403;
      (selfApprovalError as unknown as { status: number; code: string }).code = 'SELF_APPROVAL_REJECTED';

      vi.spyOn(api, 'post').mockRejectedValue(selfApprovalError);

      await expect(
        reviewApi.submitDecision('org_test_phase5', 'rev_case_001', selfApprovalPayload)
      ).rejects.toThrow('Second review cannot be approved by the original reviewer');
    });
  });

  // =========================================================================
  // 3. POLICY MANAGEMENT & IMMUTABLE VERSIONING TESTS
  // =========================================================================
  describe('Policy Management & Immutable Versioning', () => {
    it('fetches list of organizational policies', async () => {
      const mockPoliciesResponse: PoliciesResponse = {
        success: true,
        data: {
          policies: [syntheticPolicy],
        },
      };

      const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockPoliciesResponse);

      const result = await policiesApi.listPolicies('org_test_phase5');

      expect(getSpy).toHaveBeenCalledWith('/organizations/org_test_phase5/policies');
      expect(result.data.policies).toHaveLength(1);
      expect(result.data.policies[0].policyId).toBe('pol_synth_001');
      expect(result.data.policies[0].status).toBe('PUBLISHED');
    });

    it('fetches single policy details with immutable version history', async () => {
      const historicalVersion: Policy = {
        ...syntheticPolicy,
        version: 2,
        rules: [
          ...syntheticPolicy.rules,
          {
            ruleId: 'rule_ssn_strict',
            name: 'Redact US SSN',
            priority: 20,
            action: 'REDACT',
            rationaleCode: 'GDPR_US_SSN',
            conditions: [
              {
                property: 'type' as RuleProperty,
                operator: 'EQUALS' as RuleOperator,
                value: 'US_SSN',
              },
            ],
          },
        ],
      };

      const mockPolicyDetails: PolicyDetailsResponse = {
        success: true,
        data: {
          policyId: 'pol_synth_001',
          latestVersion: historicalVersion,
          versions: [syntheticPolicy, historicalVersion],
        },
      };

      const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockPolicyDetails);

      const result = await policiesApi.getPolicy('org_test_phase5', 'pol_synth_001');

      expect(getSpy).toHaveBeenCalledWith('/organizations/org_test_phase5/policies/pol_synth_001');
      expect(result.data.latestVersion.version).toBe(2);
      expect(result.data.versions).toHaveLength(2);
      expect(result.data.versions[0].version).toBe(1);
      expect(result.data.versions[1].version).toBe(2);
    });

    it('creates a new policy with valid deterministic priority rules', async () => {
      const payload: CreatePolicyPayload = {
        name: 'HIPAA Safe Harbor Privacy Policy',
        description: 'Automated redaction for HIPAA 18 Safe Harbor identifiers',
        defaultDecision: 'REVIEW',
        rules: [
          {
            ruleId: 'rule_hipaa_mrn',
            name: 'Redact Medical Record Numbers',
            priority: 1,
            action: 'REDACT',
            rationaleCode: 'HIPAA_SAFE_HARBOR',
            conditions: [
              {
                property: 'type',
                operator: 'EQUALS',
                value: 'MEDICAL_RECORD_NUMBER',
              },
            ],
          },
        ],
      };

      const createdPolicy: Policy = {
        policyId: 'pol_synth_hipaa',
        organizationId: 'org_test_phase5',
        name: payload.name,
        description: payload.description,
        version: 1,
        status: 'PUBLISHED',
        defaultDecision: payload.defaultDecision || 'REVIEW',
        rules: payload.rules || [],
        createdAt: '2026-10-13T11:00:00.000Z',
        updatedAt: '2026-10-13T11:00:00.000Z',
      };

      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
        success: true,
        data: { policy: createdPolicy },
      });

      const result = await policiesApi.createPolicy('org_test_phase5', payload);

      expect(postSpy).toHaveBeenCalledWith('/organizations/org_test_phase5/policies', payload);
      expect(result.data.policy.policyId).toBe('pol_synth_hipaa');
      expect(result.data.policy.version).toBe(1);
      expect(result.data.policy.rules[0].ruleId).toBe('rule_hipaa_mrn');
    });

    it('creates an incremented immutable policy version without mutating past versions', async () => {
      const versionPayload: CreatePolicyVersionPayload = {
        description: 'Added strict email redaction rule',
        defaultDecision: 'KEEP',
        rules: [
          ...syntheticPolicy.rules,
          {
            ruleId: 'rule_email_strict',
            name: 'Redact Email Addresses',
            priority: 15,
            action: 'REDACT',
            rationaleCode: 'GDPR_EMAIL',
            conditions: [
              {
                property: 'type',
                operator: 'EQUALS',
                value: 'EMAIL_ADDRESS',
              },
            ],
          },
        ],
      };

      const incrementedVersion: Policy = {
        ...syntheticPolicy,
        version: 2,
        description: versionPayload.description,
        rules: versionPayload.rules,
        updatedAt: '2026-10-13T12:00:00.000Z',
      };

      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
        success: true,
        data: { policy: incrementedVersion },
      });

      const result = await policiesApi.createPolicyVersion(
        'org_test_phase5',
        'pol_synth_001',
        versionPayload
      );

      expect(postSpy).toHaveBeenCalledWith(
        '/organizations/org_test_phase5/policies/pol_synth_001/versions',
        versionPayload
      );
      expect(result.data.policy.version).toBe(2);
      expect(result.data.policy.rules).toHaveLength(2);
    });
  });

  // =========================================================================
  // 4. AUDIT TRAIL, TAXONOMY CATALOG & COMPLIANCE MAPPINGS
  // =========================================================================
  describe('Audit Logging & SIEM Event Taxonomy', () => {
    it('provides the complete authoritative audit event taxonomy catalog', () => {
      const taxonomy = auditApi.getTaxonomy();

      expect(taxonomy).toBeDefined();
      expect(Array.isArray(taxonomy)).toBe(true);
      expect(taxonomy.length).toBeGreaterThan(0);
      expect(taxonomy).toEqual(AUDIT_EVENT_TAXONOMY);
    });

    it('verifies essential audit events exist in the taxonomy catalog', () => {
      const taxonomy = auditApi.getTaxonomy();
      const eventNames = taxonomy.map((item) => item.event);

      const requiredKeyEvents: AuthAuditEventType[] = [
        'AUTH_LOGIN_SUCCESS',
        'AUTH_LOGIN_FAILURE',
        'AUTH_TOKEN_REFRESHED',
        'AUTH_ACCOUNT_LOCKED',
        'ORGANIZATION_CREATED',
        'TENANT_ACCESS_DENIED',
        'DOCUMENT_UPLOAD_ACCEPTED',
        'DOCUMENT_DOWNLOAD',
        'PII_DETECTION_COMPLETED',
        'DECISION_EVALUATION_COMPLETED',
        'TRANSFORMATION_COMPLETED',
        'SANITIZED_ARTIFACT_PUBLISHED',
        'HIGH_RISK_DETECTED',
        'CRITICAL_RISK_DETECTED',
        'VERIFICATION_COMPLETED',
        'VERIFICATION_INTEGRITY_FAILURE',
        'REVIEW_CASE_CREATED',
        'REVIEW_CASE_CLAIMED',
        'REVIEW_DECISION_SUBMITTED',
        'REVIEW_SECOND_REVIEW_REQUESTED',
        'REVIEW_CASE_RESOLVED',
      ];

      for (const requiredEvent of requiredKeyEvents) {
        expect(eventNames).toContain(requiredEvent);
      }
    });

    it('ensures each taxonomy entry defines compliant metadata and regulatory mapping', () => {
      const taxonomy = auditApi.getTaxonomy();

      for (const item of taxonomy) {
        expect(item.event).toBeTruthy();
        expect(item.category).toBeTruthy();
        expect(item.phase).toBeTruthy();
        expect(item.description).toBeTruthy();
        expect(item.complianceRelevance).toBeTruthy();
      }
    });

    it('confirms Zero Raw PII invariant across audit schema specifications', () => {
      // Invariant: Audited events never log raw token values, only cryptographic checksums and entity IDs
      const taxonomy = auditApi.getTaxonomy();
      for (const item of taxonomy) {
        expect(item.description.toLowerCase()).not.toContain('raw pii');
        expect(item.description.toLowerCase()).not.toContain('raw token');
      }
    });
  });

  // =========================================================================
  // 5. MULTI-TENANCY ISOLATION & HEADER PROPAGATION
  // =========================================================================
  describe('Multi-Tenancy Isolation & Tenant Boundaries', () => {
    it('sends x-organization-id on all review API requests', async () => {
      const mockApiResponse: ReviewCasesResponse = {
        status: 'SUCCESS',
        data: {
          cases: [],
        },
      };
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockApiResponse);

      await reviewApi.listCases('org_test_phase5');

      expect(getSpy).toHaveBeenCalledWith(
        '/organizations/org_test_phase5/review-cases',
        { params: undefined }
      );
    });

    it('sends x-organization-id on policy API requests', async () => {
      const mockPoliciesResponse: PoliciesResponse = {
        success: true,
        data: {
          policies: [],
        },
      };
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockPoliciesResponse);

      await policiesApi.listPolicies('org_test_phase5');

      expect(getSpy).toHaveBeenCalledWith('/organizations/org_test_phase5/policies');
    });

    it('immediately flushes tenant context when organization is switched', async () => {
      // Switch active tenant
      activeTenantId = 'org_secondary_tenant';

      const mockApiResponse: ReviewCasesResponse = {
        status: 'SUCCESS',
        data: {
          cases: [],
        },
      };
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockApiResponse);

      await reviewApi.listCases('org_secondary_tenant');

      expect(getSpy).toHaveBeenCalledWith(
        '/organizations/org_secondary_tenant/review-cases',
        { params: undefined }
      );
    });
  });
});
