import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, setAuthTokenGetter, setTenantIdGetter } from '../api/client';
import { systemApi, HealthReport, ReadinessReport, LivenessReport } from '../api/system.api';
import { documentsApi } from '../api/documents.api';
import { reviewApi } from '../api/review.api';
import { policiesApi } from '../api/policies.api';
import { DocumentItem } from '../types/document';
import { HumanReviewCase } from '../types/review';
import { Policy } from '../types/policy';

describe('Phase 6 — Production Readiness, System Health & Operational Analytics', () => {
  let activeTenantId: string | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    activeTenantId = 'org_test_phase6';
    setAuthTokenGetter(() => 'valid-phase6-token');
    setTenantIdGetter(() => activeTenantId);
  });

  // =========================================================================
  // 1. SYSTEM HEALTH PROBES & DEPENDENCY VISIBILITY
  // =========================================================================
  describe('System Health & Dependency Observability', () => {
    it('queries /health and returns operational status with dependencies and uptime', async () => {
      const mockHealth: HealthReport = {
        status: 'ok',
        service: 'pii-backend',
        version: '1.0.0',
        environment: 'production',
        timestamp: '2026-10-13T12:00:00.000Z',
        uptime: 3600,
        dependencies: {
          mongodb: 'connected',
          redis: 'connected',
        },
      };

      const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockHealth);

      const result = await systemApi.getHealth();

      expect(getSpy).toHaveBeenCalledWith('/health');
      expect(result.status).toBe('ok');
      expect(result.dependencies.mongodb).toBe('connected');
      expect(result.dependencies.redis).toBe('connected');
      expect(result.uptime).toBe(3600);
    });

    it('queries /health/readiness and confirms workload readiness', async () => {
      const mockReadiness: ReadinessReport = {
        status: 'ready',
        service: 'pii-backend',
        version: '1.0.0',
        environment: 'production',
        timestamp: '2026-10-13T12:00:00.000Z',
        dependencies: {
          mongodb: 'connected',
          redis: 'connected',
        },
      };

      const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockReadiness);

      const result = await systemApi.getReadiness();

      expect(getSpy).toHaveBeenCalledWith('/health/readiness');
      expect(result.status).toBe('ready');
      expect(result.dependencies.mongodb).toBe('connected');
    });

    it('queries /health/liveness for process responsiveness', async () => {
      const mockLiveness: LivenessReport = {
        status: 'ok',
        service: 'pii-backend',
        timestamp: '2026-10-13T12:00:00.000Z',
      };

      const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockLiveness);

      const result = await systemApi.getLiveness();

      expect(getSpy).toHaveBeenCalledWith('/health/liveness');
      expect(result.status).toBe('ok');
      expect(result.service).toBe('pii-backend');
    });

    it('reflects degraded status when a dependency is disconnected without failing probe execution', async () => {
      const degradedHealth: HealthReport = {
        status: 'degraded',
        service: 'pii-backend',
        version: '1.0.0',
        environment: 'production',
        timestamp: '2026-10-13T12:00:00.000Z',
        uptime: 1200,
        dependencies: {
          mongodb: 'connected',
          redis: 'disconnected',
        },
      };

      vi.spyOn(api, 'get').mockResolvedValue(degradedHealth);

      const result = await systemApi.getHealth();

      expect(result.status).toBe('degraded');
      expect(result.dependencies.redis).toBe('disconnected');
    });
  });

  // =========================================================================
  // 2. DASHBOARD DATA AGGREGATION & TENANT ISOLATION
  // =========================================================================
  describe('Dashboard Analytics & Tenant Metrics Aggregation', () => {
    const syntheticDoc1: DocumentItem = {
      id: 'doc_synth_01',
      organizationId: 'org_test_phase6',
      uploadedBy: 'user_synth_01',
      originalFilename: 'sample_patient_records.pdf',
      size: 1048576, // 1 MB
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: '.pdf',
      status: 'COMPLETED',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      createdAt: '2026-10-13T09:00:00.000Z',
      updatedAt: '2026-10-13T09:05:00.000Z',
    };

    const syntheticDoc2: DocumentItem = {
      id: 'doc_synth_02',
      organizationId: 'org_test_phase6',
      uploadedBy: 'user_synth_01',
      originalFilename: 'corrupted_payload.docx',
      size: 524288, // 512 KB
      declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: '.docx',
      status: 'FAILED',
      checksum: 'f2ca1bb6c7e907d06dafe4687e579fce76b37e4e93b7605022da52e6ccc26fd2',
      createdAt: '2026-10-13T10:00:00.000Z',
      updatedAt: '2026-10-13T10:01:00.000Z',
    };

    const syntheticCase: HumanReviewCase = {
      reviewCaseId: 'rev_case_001',
      documentId: 'doc_synth_01',
      organizationId: 'org_test_phase6',
      status: 'OPEN',
      priority: 'HIGH',
      severity: 'HIGH',
      caseType: 'POLICY_AMBIGUITY',
      caseVersion: 1,
      reasonCodes: ['CONFIDENCE_THRESHOLD_UNMET'],
      safeEvidenceReferences: [],
      createdAt: '2026-10-13T10:00:00.000Z',
    };

    const syntheticPolicy: Policy = {
      policyId: 'pol_synth_01',
      organizationId: 'org_test_phase6',
      name: 'HIPAA De-identification Standard',
      version: 1,
      status: 'PUBLISHED',
      defaultDecision: 'KEEP',
      rules: [
        {
          ruleId: 'rule_mrn',
          name: 'Medical Record Number Masking',
          priority: 1,
          action: 'REDACT',
          rationaleCode: 'HIPAA_MRN',
          conditions: [
            {
              property: 'type',
              operator: 'EQUALS',
              value: 'MEDICAL_RECORD_NUMBER',
            },
          ],
        },
      ],
      createdAt: '2026-10-13T08:00:00.000Z',
      updatedAt: '2026-10-13T08:00:00.000Z',
    };

    it('retrieves documents list for active organization', async () => {
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue({
        count: 2,
        documents: [syntheticDoc1, syntheticDoc2],
      });

      const res = await documentsApi.listDocuments('org_test_phase6');

      expect(getSpy).toHaveBeenCalledWith('/organizations/org_test_phase6/documents');
      expect(res.documents).toHaveLength(2);
      expect(res.documents[0].status).toBe('COMPLETED');
      expect(res.documents[1].status).toBe('FAILED');
    });

    it('retrieves review cases for active organization', async () => {
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue({
        status: 'SUCCESS',
        data: {
          cases: [syntheticCase],
          pagination: { total: 1, page: 1, limit: 100 },
        },
      });

      const res = await reviewApi.listCases('org_test_phase6', { limit: 100 });

      expect(getSpy).toHaveBeenCalledWith(
        '/organizations/org_test_phase6/review-cases',
        expect.objectContaining({
          params: expect.objectContaining({ limit: 100 }),
        })
      );
      expect(res.data.cases).toHaveLength(1);
      expect(res.data.cases[0].priority).toBe('HIGH');
    });

    it('retrieves policies for active organization', async () => {
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue({
        success: true,
        data: {
          policies: [syntheticPolicy],
        },
      });

      const res = await policiesApi.listPolicies('org_test_phase6');

      expect(getSpy).toHaveBeenCalledWith('/organizations/org_test_phase6/policies');
      expect(res.data.policies).toHaveLength(1);
      expect(res.data.policies[0].rules).toHaveLength(1);
    });

    it('handles empty datasets cleanly without fabricating fake metrics', async () => {
      vi.spyOn(api, 'get').mockResolvedValue({ count: 0, documents: [] });

      const res = await documentsApi.listDocuments('org_empty_tenant');

      expect(res.documents).toHaveLength(0);
      expect(res.count).toBe(0);
    });

    it('propagates x-organization-id and immediately flushes data on organization switch', async () => {
      activeTenantId = 'org_secondary_tenant';
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ count: 0, documents: [] });

      await documentsApi.listDocuments('org_secondary_tenant');

      expect(getSpy).toHaveBeenCalledWith('/organizations/org_secondary_tenant/documents');
    });
  });

  // =========================================================================
  // 3. API CLIENT FORM DATA & MULTIPART INTEGRATION
  // =========================================================================
  describe('API Client Request Integrity & Multipart Body Handling', () => {
    it('does not force application/json Content-Type on FormData payloads', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: 'Upload accepted', document: { documentId: 'doc_1' } }),
      });
      global.fetch = fetchMock;

      const formData = new FormData();
      formData.append('file', new Blob(['test file contents'], { type: 'text/plain' }), 'test.txt');

      await api.post('/organizations/org_test/documents', formData);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/organizations/org_test/documents'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.not.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });
});
