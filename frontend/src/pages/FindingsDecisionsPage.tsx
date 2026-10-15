import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../context/AuthContext';
import { documentsApi } from '../api/documents.api';
import { findingsApi } from '../api/findings.api';
import { DocumentItem, NormalizedDocument } from '../types/document';
import { PIICandidateItem } from '../types/pii';
import { DecisionResultItem, DecisionRun } from '../types/policy';
import { OutputArtifact, TransformationRun } from '../types/transformation';
import { ReidentificationRiskRun } from '../types/risk';
import { VerificationRun, VerificationResultItem } from '../types/verification';
import { HumanReviewCase } from '../types/review';

// Workspace Components
import { DocumentTextPreview } from '../components/findings/DocumentTextPreview';
import { FindingsTable } from '../components/findings/FindingsTable';
import { FindingDetailsDrawer } from '../components/findings/FindingDetailsDrawer';
import { PolicyDecisionsView } from '../components/findings/PolicyDecisionsView';
import { RedactionTransformationsView } from '../components/findings/RedactionTransformationsView';
import { RiskAssessmentView } from '../components/findings/RiskAssessmentView';
import { IndependentVerificationView } from '../components/findings/IndependentVerificationView';
import { ReviewDecisionModal } from '../components/findings/ReviewDecisionModal';

import { FileText, SearchCode, RefreshCw } from 'lucide-react';

export const FindingsDecisionsPage: React.FC = () => {
  const { currentOrgId, hasPermission } = useAuth();
  const activeOrgId = currentOrgId || 'org_primary';
  const [searchParams, setSearchParams] = useSearchParams();
  const queryDocId = searchParams.get('documentId');

  // Active workspace state
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(queryDocId || '');
  const [activeTab, setActiveTab] = useState('findings');

  // Pipeline Data States
  const [normalizedDoc, setNormalizedDoc] = useState<NormalizedDocument | null>(null);
  const [findings, setFindings] = useState<PIICandidateItem[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  const [decisionRun, setDecisionRun] = useState<DecisionRun | null>(null);
  const [decisions, setDecisions] = useState<DecisionResultItem[]>([]);

  const [outputArtifact, setOutputArtifact] = useState<OutputArtifact | null>(null);
  const [transformationRun, setTransformationRun] = useState<TransformationRun | null>(null);

  const [riskRun, setRiskRun] = useState<ReidentificationRiskRun | null>(null);

  const [verificationRun, setVerificationRun] = useState<VerificationRun | null>(null);
  const [verificationResults, setVerificationResults] = useState<VerificationResultItem[]>([]);

  const [reviewCases, setReviewCases] = useState<HumanReviewCase[]>([]);

  // Loading & In-flight states
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isEvaluatingPolicy, setIsEvaluatingPolicy] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isEvaluatingRisk, setIsEvaluatingRisk] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Review modal state
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewCaseToAdjudicate, setReviewCaseToAdjudicate] = useState<string | null>(null);

  // Multi-tenant stale-response protection
  const activeOrgIdRef = useRef(activeOrgId);
  const activeDocIdRef = useRef(selectedDocId);
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    activeOrgIdRef.current = activeOrgId;
  }, [activeOrgId]);

  useEffect(() => {
    activeDocIdRef.current = selectedDocId;
  }, [selectedDocId]);

  // Load organization documents
  const loadOrganizationDocuments = useCallback(async () => {
    setIsLoadingDocuments(true);
    setErrorNotice(null);
    try {
      const res = await documentsApi.listDocuments(activeOrgId);
      const docs = res.documents || [];
      setDocuments(docs);

      // Select document matching query param or default to first document
      if (docs.length > 0) {
        setSelectedDocId((prev) => {
          const currentUrlDocId = new URLSearchParams(window.location.search).get('documentId');
          if (currentUrlDocId && docs.some((d) => d.id === currentUrlDocId)) {
            return currentUrlDocId;
          }
          if (prev && docs.some((d) => d.id === prev)) {
            return prev;
          }
          return docs[0].id;
        });
      } else {
        setSelectedDocId('');
      }
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to load organization documents');
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [activeOrgId]);

  // Flush state when organization switches
  useEffect(() => {
    setDocuments([]);
    setSelectedDocId('');
    setNormalizedDoc(null);
    setFindings([]);
    setSelectedFindingId(null);
    setDecisionRun(null);
    setDecisions([]);
    setOutputArtifact(null);
    setTransformationRun(null);
    setRiskRun(null);
    setVerificationRun(null);
    setVerificationResults([]);
    setReviewCases([]);
    setErrorNotice(null);
    setSuccessBanner(null);

    loadOrganizationDocuments();
  }, [activeOrgId, loadOrganizationDocuments]);

  // Sync selectedDocId when queryDocId in URL changes externally
  useEffect(() => {
    if (queryDocId && documents.some((d) => d.id === queryDocId)) {
      setSelectedDocId((prev) => (prev === queryDocId ? prev : queryDocId));
    }
  }, [queryDocId, documents]);

  // Load all pipeline records for selected document
  const loadDocumentWorkspaceData = useCallback(
    async (docId: string) => {
      if (!docId) return;

      const currentGen = ++fetchGenerationRef.current;
      const targetOrg = activeOrgId;
      setIsLoadingWorkspace(true);
      setErrorNotice(null);

      try {
        // Parallel fetch across all pipeline services
        const [
          contentRes,
          candidatesRes,
          decisionsRes,
          artifactRes,
          riskRes,
          verificationRes,
          reviewCasesRes,
        ] = await Promise.allSettled([
          findingsApi.getNormalizedContent(targetOrg, docId),
          findingsApi.getCandidates(targetOrg, docId),
          findingsApi.getDecisions(targetOrg, docId),
          findingsApi.getTransformationArtifacts(targetOrg, docId),
          findingsApi.getRiskResults(targetOrg, docId),
          findingsApi.getVerificationResults(targetOrg, docId),
          findingsApi.getReviewCases(targetOrg, { limit: 50 }),
        ]);

        // Stale check
        if (currentGen !== fetchGenerationRef.current || activeOrgIdRef.current !== targetOrg) {
          return;
        }

        // 1. Normalized Content
        if (contentRes.status === 'fulfilled' && contentRes.value.normalizedDocument) {
          setNormalizedDoc(contentRes.value.normalizedDocument);
        } else {
          setNormalizedDoc(null);
        }

        // 2. Candidates
        if (candidatesRes.status === 'fulfilled' && candidatesRes.value?.data?.candidates) {
          setFindings(candidatesRes.value.data.candidates);
        } else {
          setFindings([]);
        }

        // 3. Decisions
        if (decisionsRes.status === 'fulfilled' && decisionsRes.value?.data) {
          setDecisionRun(decisionsRes.value.data.run);
          setDecisions(decisionsRes.value.data.results || []);
        } else {
          setDecisionRun(null);
          setDecisions([]);
        }

        // 4. Transformation Artifacts
        if (artifactRes.status === 'fulfilled' && artifactRes.value?.data) {
          setOutputArtifact(artifactRes.value.data.outputArtifact || null);
          setTransformationRun(artifactRes.value.data.transformationRun || null);
        } else {
          setOutputArtifact(null);
          setTransformationRun(null);
        }

        // 5. Risk Results
        if (riskRes.status === 'fulfilled' && riskRes.value?.data) {
          setRiskRun(riskRes.value.data.riskRun || null);
        } else {
          setRiskRun(null);
        }

        // 6. Verification Results
        if (verificationRes.status === 'fulfilled' && verificationRes.value?.data) {
          setVerificationRun(verificationRes.value.data.verificationRun || null);
          setVerificationResults(verificationRes.value.data.results || []);
        } else {
          setVerificationRun(null);
          setVerificationResults([]);
        }

        // 7. Review Cases
        if (reviewCasesRes.status === 'fulfilled' && reviewCasesRes.value?.data?.cases) {
          // Filter to cases for this document
          const docCases = reviewCasesRes.value.data.cases.filter(
            (c) => c.documentId === docId
          );
          setReviewCases(docCases);
        } else {
          setReviewCases([]);
        }
      } catch (err: unknown) {
        if (currentGen === fetchGenerationRef.current) {
          setErrorNotice(err instanceof Error ? err.message : 'Error loading document pipeline data');
        }
      } finally {
        if (currentGen === fetchGenerationRef.current) {
          setIsLoadingWorkspace(false);
        }
      }
    },
    [activeOrgId]
  );

  useEffect(() => {
    if (selectedDocId) {
      loadDocumentWorkspaceData(selectedDocId);
    }
  }, [selectedDocId, loadDocumentWorkspaceData]);

  const selectedDocument = documents.find((d) => d.id === selectedDocId) || null;

  // Finding navigation helpers
  const selectedFindingIndex = findings.findIndex((f) => f.candidateId === selectedFindingId);
  const selectedFinding = selectedFindingIndex >= 0 ? findings[selectedFindingIndex] : null;
  const matchingDecision =
    decisions.find((d) => d.candidateId === selectedFindingId) || null;

  const handleNavigatePrevious = () => {
    if (selectedFindingIndex > 0) {
      setSelectedFindingId(findings[selectedFindingIndex - 1].candidateId);
    }
  };

  const handleNavigateNext = () => {
    if (selectedFindingIndex < findings.length - 1) {
      setSelectedFindingId(findings[selectedFindingIndex + 1].candidateId);
    }
  };

  // Trigger handlers
  const handleTriggerDetection = async () => {
    if (!selectedDocId) return;
    setIsDetecting(true);
    setErrorNotice(null);
    try {
      await findingsApi.triggerDetection(activeOrgId, selectedDocId, { force: true });
      setSuccessBanner('PII Candidate detection completed.');
      await loadDocumentWorkspaceData(selectedDocId);
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to execute PII detection');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleTriggerDecisionEvaluation = async () => {
    if (!selectedDocId) return;
    setIsEvaluatingPolicy(true);
    setErrorNotice(null);
    try {
      await findingsApi.triggerDecisionEvaluation(activeOrgId, selectedDocId);
      setSuccessBanner('Policy decisions evaluated successfully.');
      await loadDocumentWorkspaceData(selectedDocId);
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to evaluate policy');
    } finally {
      setIsEvaluatingPolicy(false);
    }
  };

  const handleExecuteTransformation = async () => {
    if (!selectedDocId) return;
    setIsTransforming(true);
    setErrorNotice(null);
    try {
      await findingsApi.executeTransformation(activeOrgId, selectedDocId, { force: true });
      setSuccessBanner('Transformation executed. Output artifact generated.');
      await loadDocumentWorkspaceData(selectedDocId);
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to execute transformation');
    } finally {
      setIsTransforming(false);
    }
  };

  const handleExecuteRiskAnalysis = async () => {
    if (!selectedDocId) return;
    setIsEvaluatingRisk(true);
    setErrorNotice(null);
    try {
      await findingsApi.executeRiskAnalysis(activeOrgId, selectedDocId, { force: true });
      setSuccessBanner('Re-identification risk analysis completed.');
      await loadDocumentWorkspaceData(selectedDocId);
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to execute risk analysis');
    } finally {
      setIsEvaluatingRisk(false);
    }
  };

  const handleExecuteVerification = async () => {
    if (!selectedDocId) return;
    setIsVerifying(true);
    setErrorNotice(null);
    try {
      await findingsApi.executeVerification(activeOrgId, selectedDocId, { force: true });
      setSuccessBanner('Independent verification QA evaluation completed.');
      await loadDocumentWorkspaceData(selectedDocId);
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to execute verification');
    } finally {
      setIsVerifying(false);
    }
  };

  const tabs = [
    {
      id: 'findings',
      label: 'PII Findings & Text Preview',
      count: findings.length,
    },
    {
      id: 'decisions',
      label: 'Policy Decisions',
      count: decisions.length,
    },
    {
      id: 'transformations',
      label: 'Redaction & Transformations',
    },
    {
      id: 'risk',
      label: 'Re-Identification Risk',
    },
    {
      id: 'verification',
      label: 'Independent Verification QA',
      count: verificationResults.filter((r) => !r.passed).length || undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Findings, Policy, Redaction & Risk"
        description="Inspect raw PII candidates, evaluate tenant policy decisions, inspect physical transformations, and verify compliance."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedDocId && loadDocumentWorkspaceData(selectedDocId)}
              isLoading={isLoadingWorkspace}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh Workspace
            </Button>
            {hasPermission('DOCUMENT_READ') && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleTriggerDetection}
                isLoading={isDetecting}
                leftIcon={<SearchCode className="w-3.5 h-3.5" />}
              >
                Run PII Detection
              </Button>
            )}
          </div>
        }
      />

      {successBanner && (
        <Alert
          variant="success"
          title="Operation Succeeded"
          onDismiss={() => setSuccessBanner(null)}
        >
          {successBanner}
        </Alert>
      )}

      {errorNotice && (
        <Alert variant="critical" title="Notice" onDismiss={() => setErrorNotice(null)}>
          {errorNotice}
        </Alert>
      )}

      {/* Document Selector & Provenance Header Bar */}
      <div className="p-4 rounded-lg bg-surface-white border border-surface-border shadow-subtle flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <span className="font-semibold text-brand-deep-teal shrink-0">Active Document:</span>
          <div className="min-w-[240px] flex-1 md:w-80">
            <Select
              value={selectedDocId}
              onChange={(e) => {
                setSelectedDocId(e.target.value);
                setSearchParams({ documentId: e.target.value });
              }}
              options={
                documents.length === 0
                  ? [{ value: '', label: 'No documents in organization' }]
                  : documents.map((d) => ({
                      value: d.id,
                      label: `${d.originalFilename} (${d.status})`,
                    }))
              }
              disabled={isLoadingDocuments || documents.length === 0}
            />
          </div>
        </div>

        {selectedDocument && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary w-full md:w-auto">
            <div>
              <span className="text-text-muted text-[10px] uppercase font-mono block">Format</span>
              <span className="font-semibold uppercase text-brand-deep-teal">
                .{selectedDocument.extension}
              </span>
            </div>
            <div>
              <span className="text-text-muted text-[10px] uppercase font-mono block">Status</span>
              <Badge variant="teal">{selectedDocument.status}</Badge>
            </div>
            <div>
              <span className="text-text-muted text-[10px] uppercase font-mono block">SHA-256</span>
              <span className="font-mono text-[11px] text-text-muted" title={selectedDocument.checksum}>
                {selectedDocument.checksum.substring(0, 10)}...
              </span>
            </div>
          </div>
        )}
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-8 h-8" />}
          title="No documents in organization"
          description={`Organization [${activeOrgId}] currently contains no uploaded documents. Upload a document in the Document Repository first.`}
        />
      ) : isLoadingWorkspace ? (
        <div className="space-y-4">
          <Skeleton height={42} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton height={320} />
            <Skeleton height={320} />
          </div>
        </div>
      ) : (
        <>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

          {/* TAB 1: PII Findings & Text Preview */}
          {activeTab === 'findings' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left / Middle: Text Stream & Findings Table */}
              <div className="lg:col-span-8 space-y-6">
                <DocumentTextPreview
                  normalizedDoc={normalizedDoc}
                  findings={findings}
                  selectedFindingId={selectedFindingId}
                  onSelectFinding={setSelectedFindingId}
                />

                <FindingsTable
                  findings={findings}
                  selectedFindingId={selectedFindingId}
                  onSelectFinding={setSelectedFindingId}
                />
              </div>

              {/* Right: Selected Finding Details Drawer */}
              <div className="lg:col-span-4">
                {selectedFinding ? (
                  <FindingDetailsDrawer
                    finding={selectedFinding}
                    decision={matchingDecision}
                    onClose={() => setSelectedFindingId(null)}
                    onNavigatePrevious={handleNavigatePrevious}
                    onNavigateNext={handleNavigateNext}
                    hasPrevious={selectedFindingIndex > 0}
                    hasNext={selectedFindingIndex < findings.length - 1}
                  />
                ) : (
                  <div className="p-8 border-2 border-dashed border-surface-border rounded-lg bg-surface-white text-center text-xs text-text-secondary">
                    <SearchCode className="w-8 h-8 text-text-muted mx-auto mb-2" />
                    <p className="font-semibold text-text-primary">No Finding Selected</p>
                    <p className="text-[11px] text-text-muted mt-1">
                      Click any highlighted span in the text stream or click Inspect in the findings
                      table to inspect origin, context, and policy decision details.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Policy Decisions & Adjudication */}
          {activeTab === 'decisions' && (
            <PolicyDecisionsView
              decisionRun={decisionRun}
              decisions={decisions}
              reviewCases={reviewCases}
              isEvaluating={isEvaluatingPolicy}
              onTriggerEvaluation={handleTriggerDecisionEvaluation}
              onOpenReviewModal={(caseId) => {
                setReviewCaseToAdjudicate(caseId || null);
                setIsReviewModalOpen(true);
              }}
            />
          )}

          {/* TAB 3: Redaction & Transformations */}
          {activeTab === 'transformations' && (
            <RedactionTransformationsView
              document={selectedDocument}
              outputArtifact={outputArtifact}
              transformationRun={transformationRun}
              isTransforming={isTransforming}
              onExecuteTransformation={handleExecuteTransformation}
            />
          )}

          {/* TAB 4: Re-Identification Risk */}
          {activeTab === 'risk' && (
            <RiskAssessmentView
              riskRun={riskRun}
              isEvaluating={isEvaluatingRisk}
              onExecuteRiskAnalysis={handleExecuteRiskAnalysis}
            />
          )}

          {/* TAB 5: Independent Verification QA */}
          {activeTab === 'verification' && (
            <IndependentVerificationView
              verificationRun={verificationRun}
              results={verificationResults}
              isVerifying={isVerifying}
              onExecuteVerification={handleExecuteVerification}
            />
          )}
        </>
      )}

      {/* Human Review Decision Adjudication Modal */}
      <ReviewDecisionModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        organizationId={activeOrgId}
        caseId={reviewCaseToAdjudicate}
        onDecisionSubmitted={() => {
          setSuccessBanner('Human adjudication recorded successfully.');
          if (selectedDocId) loadDocumentWorkspaceData(selectedDocId);
        }}
      />
    </div>
  );
};
