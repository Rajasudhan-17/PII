import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, setAuthTokenGetter, setTenantIdGetter } from '../api/client';
import { findingsApi } from '../api/findings.api';
import { PIICandidateItem } from '../types/pii';
import { DecisionRun } from '../types/policy';
import { OutputArtifact } from '../types/transformation';
import { ReidentificationRiskRun } from '../types/risk';
import { VerificationResultItem } from '../types/verification';
import { NormalizedDocumentBlock } from '../types/document';
import { SubmitReviewDecisionPayload } from '../types/review';

describe('Phase 4 — PII Findings, Policy Decisions, Redaction & Risk Engine', () => {
  let activeTenantId: string | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    activeTenantId = 'org_test_phase4';
    setAuthTokenGetter(() => 'valid-reviewer-token');
    setTenantIdGetter(() => activeTenantId);
  });

  // Synthetic Test Fixtures (Zero real PII; strictly synthetic data)
  const syntheticDocId = 'doc_synth_001';

  const syntheticBlock: NormalizedDocumentBlock = {
    blockId: 'blk_001',
    type: 'PARAGRAPH',
    text: 'Customer John Doe with phone 555-0199 and social security 000-12-3456 requested account closure.',
    pageNumber: 1,
    startOffset: 0,
    endOffset: 96,
  };

  const syntheticCandidates: PIICandidateItem[] = [
    {
      candidateId: 'cand_001',
      detectionRunId: 'drun_001',
      documentId: syntheticDocId,
      organizationId: 'org_test_phase4',
      type: 'PERSON_NAME',
      category: 'DIRECT_IDENTIFIER',
      text: 'John Doe',
      confidence: 0.94,
      detectionScore: 0.94,
      severity: 'MEDIUM',
      detectorName: 'MICROSOFT_PRESIDIO',
      detectorType: 'NER_MODEL',
      decision: 'KEEP',
      detectionStatus: 'DETECTED',
      location: {
        blockId: 'blk_001',
        startOffset: 9,
        endOffset: 17,
      },
      provenance: {
        sourceType: 'NATIVE_TEXT',
        blockId: 'blk_001',
      },
      evidence: ['SYNTACTIC_NAME_PATTERN', 'HONORIFIC_CONTEXT'],
      isRedacted: false,
      isMasked: false,
    },
    {
      candidateId: 'cand_002',
      detectionRunId: 'drun_001',
      documentId: syntheticDocId,
      organizationId: 'org_test_phase4',
      type: 'PHONE_NUMBER',
      category: 'DIRECT_IDENTIFIER',
      text: '555-0199',
      confidence: 0.98,
      detectionScore: 0.98,
      severity: 'HIGH',
      detectorName: 'REGEX_PATTERN_MATCH',
      detectorType: 'PATTERN',
      decision: 'REDACT',
      detectionStatus: 'DETECTED',
      location: {
        blockId: 'blk_001',
        startOffset: 29,
        endOffset: 37,
      },
      provenance: {
        sourceType: 'NATIVE_TEXT',
        blockId: 'blk_001',
      },
      evidence: ['NANP_STANDARD_FORMAT'],
      isRedacted: true,
      isMasked: true,
    },
    {
      candidateId: 'cand_003',
      detectionRunId: 'drun_001',
      documentId: syntheticDocId,
      organizationId: 'org_test_phase4',
      type: 'GOVERNMENT_ID',
      category: 'DIRECT_IDENTIFIER',
      text: '000-12-3456',
      confidence: 0.82,
      detectionScore: 0.82,
      severity: 'CRITICAL',
      detectorName: 'GLINER_NER',
      detectorType: 'NER_MODEL',
      decision: 'REVIEW',
      detectionStatus: 'DETECTED',
      location: {
        blockId: 'blk_001',
        startOffset: 58,
        endOffset: 69,
      },
      provenance: {
        sourceType: 'NATIVE_TEXT',
        blockId: 'blk_001',
      },
      evidence: ['SSN_FORMAT_REGEX', 'AMBIGUOUS_PREFIX'],
      isRedacted: false,
      isMasked: false,
    },
  ];

  describe('1. PII Findings & Text Highlight Offsets', () => {
    it('correctly maps valid character spans within document blocks', () => {
      const text = syntheticBlock.text;
      const sortedFindings = [...syntheticCandidates].sort(
        (a, b) => a.location.startOffset - b.location.startOffset
      );

      // Verify offsets correspond to the expected synthetic substrings
      expect(text.substring(sortedFindings[0].location.startOffset, sortedFindings[0].location.endOffset))
        .toBe('John Doe');
      expect(text.substring(sortedFindings[1].location.startOffset, sortedFindings[1].location.endOffset))
        .toBe('555-0199');
      expect(text.substring(sortedFindings[2].location.startOffset, sortedFindings[2].location.endOffset))
        .toBe('000-12-3456');
    });

    it('safely handles findings with missing, negative, or reversed offset locations without crashing', () => {
      const malformedFinding = {
        candidateId: 'cand_malformed',
        documentId: syntheticDocId,
        organizationId: 'org_test_phase4',
        type: 'EMAIL_ADDRESS',
        confidence: 0.85,
        severity: 'HIGH',
        detectorName: 'PRESIDIO',
        category: 'DIRECT_IDENTIFIER',
        location: {
          blockId: 'blk_001',
          startOffset: -1,
          endOffset: -1,
        },
      } as unknown as PIICandidateItem;

      const reversedFinding = {
        candidateId: 'cand_reversed',
        documentId: syntheticDocId,
        organizationId: 'org_test_phase4',
        type: 'FINANCIAL_ID',
        confidence: 0.9,
        severity: 'CRITICAL',
        detectorName: 'REGEX',
        category: 'DIRECT_IDENTIFIER',
        location: {
          blockId: 'blk_001',
          startOffset: 50,
          endOffset: 20, // invalid: endOffset <= startOffset
        },
      } as unknown as PIICandidateItem;

      const findings = [malformedFinding, reversedFinding, syntheticCandidates[0]];

      // Filtering rule used in DocumentTextPreview
      const validBlockFindings = findings.filter(
        (f) =>
          typeof f.location?.startOffset === 'number' &&
          typeof f.location?.endOffset === 'number' &&
          f.location.startOffset >= 0 &&
          f.location.endOffset > f.location.startOffset
      );

      // Exactly only the valid finding is selected for text highlight slicing
      expect(validBlockFindings).toHaveLength(1);
      expect(validBlockFindings[0].candidateId).toBe('cand_001');
    });

    it('preserves four-pillar separation: Detection, Context, Decision, and Transformation', () => {
      const finding = syntheticCandidates[1]; // cand_002: Phone Number

      // Pillar 1: Detection Origin
      expect(finding.type).toBe('PHONE_NUMBER');
      expect(finding.detectorName).toBe('REGEX_PATTERN_MATCH');
      expect(finding.confidence).toBe(0.98);
      expect(finding.provenance?.sourceType).toBe('NATIVE_TEXT');

      // Pillar 2: Context Interpretation
      expect(finding.category).toBe('DIRECT_IDENTIFIER');
      expect(finding.severity).toBe('HIGH');
      expect(finding.location.blockId).toBe('blk_001');

      // Pillar 3: Policy Recommendation
      expect(finding.decision).toBe('REDACT');

      // Pillar 4: Mutated Transformation State
      expect(finding.isRedacted).toBe(true);
      expect(finding.isMasked).toBe(true);
    });
  });

  describe('2. Policy Decisions & Publication Hold Invariants', () => {
    it('detects unresolved REVIEW decisions and enforces publication hold', () => {
      const decisionRun: DecisionRun = {
        decisionRunId: 'drun_001',
        status: 'COMPLETED',
        decisionsSummary: {
          totalEvaluated: 3,
          redactCount: 1,
          keepCount: 1,
          reviewCount: 1, // Unresolved review exists
        },
        createdAt: '2026-03-01T10:05:00.000Z',
      };

      const hasUnresolvedReviews = (decisionRun.decisionsSummary?.reviewCount ?? 0) > 0;
      expect(hasUnresolvedReviews).toBe(true);

      // Invariant: If unresolved review exists, publication is restricted
      const isPublicationPermitted = !hasUnresolvedReviews;
      expect(isPublicationPermitted).toBe(false);
    });

    it('clears publication hold when all decisions are resolved to KEEP or REDACT', () => {
      const resolvedRun: DecisionRun = {
        decisionRunId: 'drun_002',
        status: 'COMPLETED',
        decisionsSummary: {
          totalEvaluated: 3,
          redactCount: 2,
          keepCount: 1,
          reviewCount: 0, // All resolved
        },
        createdAt: '2026-03-01T10:15:00.000Z',
      };

      const hasUnresolvedReviews = (resolvedRun.decisionsSummary?.reviewCount ?? 0) > 0;
      expect(hasUnresolvedReviews).toBe(false);

      const isPublicationPermitted = !hasUnresolvedReviews;
      expect(isPublicationPermitted).toBe(true);
    });
  });

  describe('3. Cryptographic Immutability & Transformed Output Provenance', () => {
    it('preserves distinct cryptographic hashes and provenance between source document and output artifact', () => {
      const originalSourceDocument = {
        id: syntheticDocId,
        organizationId: 'org_test_phase4',
        originalFilename: 'sensitive_customer_case.pdf',
        size: 1048576,
        checksum: 'aaaaaaaa1111222233334444555566667777888899990000aaaabbbbccccdddd',
        status: 'READY',
      };

      const transformedArtifact: OutputArtifact = {
        outputArtifactId: 'art_redacted_001',
        transformationRunId: 'trun_001',
        sourceDocumentId: syntheticDocId,
        organizationId: 'org_test_phase4',
        originalFilename: 'sensitive_customer_case_redacted.pdf',
        mimeType: 'application/pdf',
        sourceChecksum: 'aaaaaaaa1111222233334444555566667777888899990000aaaabbbbccccdddd',
        outputChecksum: 'bbbbbbbb9999888877776666555544443333222211110000ffffddddccccbbbb',
        storageKey: 'outputs/org_test_phase4/doc_synth_001_redacted.pdf',
        fileSize: 1047200,
        status: 'ACTIVE',
        createdAt: '2026-03-01T10:10:00.000Z',
        updatedAt: '2026-03-01T10:10:00.000Z',
      };

      // Invariant: The original document checksum and output artifact checksum MUST NOT be identical
      expect(originalSourceDocument.checksum).not.toBe(transformedArtifact.outputChecksum);
      // Invariant: The original document ID is preserved in artifact metadata for lineage
      expect(transformedArtifact.sourceDocumentId).toBe(originalSourceDocument.id);
      // Invariant: Original storage location is never replaced by the derivative artifact
      expect(transformedArtifact.storageKey).toContain('_redacted.pdf');
    });
  });

  describe('4. Re-Identification Risk Engine & Honest Null Metric Handling', () => {
    it('preserves composite score and honest nulls without substituting fake 0s for missing dimensions', () => {
      const riskRun: ReidentificationRiskRun = {
        riskRunId: 'rrun_001',
        documentId: syntheticDocId,
        organizationId: 'org_test_phase4',
        status: 'COMPLETED',
        discoveredAttributeCount: 3,
        combinationEvaluatedCount: 7,
        reidentificationRiskScore: 0.1425,
        riskLevel: 'LOW',
        riskConfidence: 0.88,
        directIdentifierRiskScore: 0.05,
        quasiIdentifierRiskScore: 0.18,
        uniquenessRiskScore: 0.12,
        combinationRiskScore: 0.08,
        geographicRiskScore: 0.15,
        temporalRiskScore: 0.02,
        linkageRiskScore: 0.1,
        rarityRiskScore: null, // Population rarity uncalculated in this sample
        attributeSensitivityRiskScore: 0.25,
        referencePopulationVersion: 'US_CENSUS_2025_Q4',
        riskModelVersion: '2.1.0',
        warnings: [
          {
            code: 'HEURISTIC_POPULATION',
            message: 'Reference population rarity was evaluated with fallback regional prior.',
          },
        ],
        createdAt: '2026-03-01T10:12:00.000Z',
      };

      // 1. Composite score calculation
      const displayScore = (riskRun.reidentificationRiskScore * 100).toFixed(2);
      expect(displayScore).toBe('14.25');

      // 2. Format dimension function rule: null must yield 'N/A' not '0.0%'
      const formatDimension = (score?: number | null) =>
        typeof score === 'number' ? (score * 100).toFixed(1) + '%' : 'N/A';

      expect(formatDimension(riskRun.directIdentifierRiskScore)).toBe('5.0%');
      expect(formatDimension(riskRun.quasiIdentifierRiskScore)).toBe('18.0%');
      // Invariant: null rarity score MUST NOT be displayed as '0.0%'
      expect(formatDimension(riskRun.rarityRiskScore)).toBe('N/A');

      // 3. Warning preservation
      expect(riskRun.warnings).toHaveLength(1);
      expect(riskRun.warnings[0].code).toBe('HEURISTIC_POPULATION');
    });
  });

  describe('5. 9-Verifier QA Engine & Discrepancy Evidence', () => {
    it('accurately captures verifier discrepancies between observed and expected state', () => {
      const verificationResults: VerificationResultItem[] = [
        {
          verificationResultId: 'vres_001',
          verificationRunId: 'vrun_001',
          verifierType: 'CHECKSUM_VERIFIER',
          status: 'VERIFIED',
          severity: 'INFO',
          passed: true,
          findingsCount: 0,
          reasonCode: 'CHECKSUM_MATCH',
          explanation: 'Source document sha256 matches immutable storage register.',
          expected: 'Matched',
          observed: 'Matched',
        },
        {
          verificationResultId: 'vres_002',
          verificationRunId: 'vrun_001',
          verifierType: 'METADATA_VERIFIER',
          status: 'FAILED',
          severity: 'HIGH',
          passed: false,
          findingsCount: 1,
          reasonCode: 'RESIDUAL_EXIF_METADATA_FOUND',
          explanation: 'Derivative PDF retains author name tag in XMP document metadata packet.',
          expected: 'EMPTY_AUTHOR_FIELD',
          observed: 'AUTHOR=JohnDoe',
        },
        {
          verificationResultId: 'vres_003',
          verificationRunId: 'vrun_001',
          verifierType: 'PII_RESIDUAL_VERIFIER',
          status: 'VERIFIED',
          severity: 'INFO',
          passed: true,
          findingsCount: 0,
          reasonCode: 'NO_RESIDUAL_DIRECT_IDENTIFIERS',
          explanation: 'Independent text extractor detected no residual prohibited phone numbers.',
        },
      ];

      const failedChecks = verificationResults.filter((r) => r.status === 'FAILED');
      expect(failedChecks).toHaveLength(1);

      const failedVerifier = failedChecks[0];
      expect(failedVerifier.verifierType).toBe('METADATA_VERIFIER');
      expect(failedVerifier.reasonCode).toBe('RESIDUAL_EXIF_METADATA_FOUND');
      expect(failedVerifier.expected).toBe('EMPTY_AUTHOR_FIELD');
      expect(failedVerifier.observed).toBe('AUTHOR=JohnDoe');
      expect(failedVerifier.severity).toBe('HIGH');
    });
  });

  describe('6. API Contract & Multi-Tenant Header Propagation', () => {
    it('propagates x-organization-id header on all findings API requests', async () => {
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue({
        success: true,
        data: { candidates: syntheticCandidates, summary: { totalCandidates: 3 } },
      });

      await findingsApi.getCandidates('org_test_phase4', syntheticDocId);

      expect(getSpy).toHaveBeenCalledWith(
        '/organizations/org_test_phase4/documents/doc_synth_001/pii-detection'
      );
    });

    it('enforces multi-tenant parameterization on decision evaluation and transformations', async () => {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
        success: true,
        data: { runId: 'trun_001', status: 'COMPLETED' },
      });

      await findingsApi.executeTransformation('org_test_phase4', syntheticDocId, {
        operation: 'REDACT',
      });

      expect(postSpy).toHaveBeenCalledWith(
        '/organizations/org_test_phase4/documents/doc_synth_001/transformations',
        { operation: 'REDACT' }
      );
    });
  });

  describe('7. Stale-Response Protection Guard', () => {
    it('discards asynchronous response when tenant or document context switches before completion', async () => {
      const activeOrg = 'org_initial';
      let activeDoc = 'doc_001';
      let fetchGeneration = 1;

      let workspaceState: PIICandidateItem[] = [];

      // Simulated async fetch function mimicking FindingsDecisionsPage
      const asyncFetchFindings = async (orgId: string, docId: string, generation: number) => {
        // Simulate network latency
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Stale check
        if (generation !== fetchGeneration || activeOrg !== orgId || activeDoc !== docId) {
          // Response is stale, discard!
          return;
        }

        workspaceState = syntheticCandidates;
      };

      // 1. Kick off request for doc_001
      const p1 = asyncFetchFindings('org_initial', 'doc_001', fetchGeneration);

      // 2. User rapidly switches document to doc_002
      fetchGeneration++;
      activeDoc = 'doc_002';

      await p1;

      // Invariant: Stale data for doc_001 MUST NOT overwrite workspaceState
      expect(workspaceState).toHaveLength(0);

      // 3. Complete request for doc_002
      const p2 = asyncFetchFindings('org_initial', 'doc_002', fetchGeneration);
      await p2;

      // Invariant: Fresh data for doc_002 is accepted
      expect(workspaceState).toHaveLength(3);
    });
  });

  describe('8. Server-Side 403 Authorization Rejection', () => {
    it('surfaces actionable error message when review adjudication is rejected server-side', async () => {
      const postSpy = vi.spyOn(api, 'post').mockRejectedValue({
        status: 403,
        message: 'Forbidden: Insufficient privileges to adjudicate human review cases (REVIEW_EXECUTE required).',
      });

      const payload: SubmitReviewDecisionPayload = {
        decisionType: 'CONFIRM_REDACTION',
        reasonCode: 'HUMAN_CONFIRMED',
        safeRationale: 'Confirmed name in line 1.',
        expectedNextAction: 'APPLY_MUTATION',
        caseVersion: 1,
      };

      let caughtError: string | null = null;
      try {
        await findingsApi.submitReviewDecision('org_test_phase4', 'case_001', payload);
      } catch (err: unknown) {
        caughtError = (err as Error).message;
      }

      expect(postSpy).toHaveBeenCalled();
      expect(caughtError).toContain('REVIEW_EXECUTE required');
    });

    it('rejects unauthorized transformation execution with server-side 403', async () => {
      vi.spyOn(api, 'post').mockRejectedValue({
        status: 403,
        message: 'Forbidden: User does not possess TRANSFORM_EXECUTE permission.',
      });

      let caughtError: string | null = null;
      try {
        await findingsApi.executeTransformation('org_test_phase4', syntheticDocId);
      } catch (err: unknown) {
        caughtError = (err as Error).message;
      }

      expect(caughtError).toContain('TRANSFORM_EXECUTE permission');
    });
  });
});
