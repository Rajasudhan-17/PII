import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Tabs } from '../components/ui/Tabs';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../context/AuthContext';
import { documentsApi } from '../api/documents.api';
import { findingsApi } from '../api/findings.api';
import { DocumentItem } from '../types/document';
import { ReidentificationRiskRun } from '../types/risk';
import { VerificationRun, VerificationResultItem } from '../types/verification';
import { IndependentVerificationView } from '../components/findings/IndependentVerificationView';
import { RiskAssessmentView } from '../components/findings/RiskAssessmentView';
import { CheckCircle2, RefreshCw } from 'lucide-react';

export const RiskVerificationPage: React.FC = () => {
  const { currentOrgId } = useAuth();
  const activeOrgId = currentOrgId || 'org_primary';

  const [activeTab, setActiveTab] = useState('verification');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');

  const [verificationRun, setVerificationRun] = useState<VerificationRun | null>(null);
  const [verificationResults, setVerificationResults] = useState<VerificationResultItem[]>([]);
  const [riskRun, setRiskRun] = useState<ReidentificationRiskRun | null>(null);

  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isEvaluatingRisk, setIsEvaluatingRisk] = useState(false);

  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const activeOrgIdRef = useRef(activeOrgId);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    activeOrgIdRef.current = activeOrgId;
  }, [activeOrgId]);

  const loadDocuments = useCallback(async () => {
    setIsLoadingDocuments(true);
    setErrorNotice(null);
    try {
      const res = await documentsApi.listDocuments(activeOrgId);
      const docs = res.documents || [];
      setDocuments(docs);
      if (docs.length > 0) {
        setSelectedDocId((prev) => (docs.some((d) => d.id === prev) ? prev : docs[0].id));
      } else {
        setSelectedDocId('');
      }
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    setDocuments([]);
    setSelectedDocId('');
    setVerificationRun(null);
    setVerificationResults([]);
    setRiskRun(null);
    setErrorNotice(null);
    setSuccessBanner(null);

    loadDocuments();
  }, [activeOrgId, loadDocuments]);

  const loadDocData = useCallback(
    async (docId: string) => {
      if (!docId) return;
      const gen = ++fetchGenRef.current;
      const org = activeOrgId;
      setIsLoadingData(true);
      setErrorNotice(null);

      try {
        const [verRes, riskRes] = await Promise.allSettled([
          findingsApi.getVerificationResults(org, docId),
          findingsApi.getRiskResults(org, docId),
        ]);

        if (gen !== fetchGenRef.current || activeOrgIdRef.current !== org) return;

        if (verRes.status === 'fulfilled' && verRes.value?.data) {
          setVerificationRun(verRes.value.data.verificationRun || null);
          setVerificationResults(verRes.value.data.results || []);
        } else {
          setVerificationRun(null);
          setVerificationResults([]);
        }

        if (riskRes.status === 'fulfilled' && riskRes.value?.data) {
          setRiskRun(riskRes.value.data.riskRun || null);
        } else {
          setRiskRun(null);
        }
      } catch (err: unknown) {
        if (gen === fetchGenRef.current) {
          setErrorNotice(err instanceof Error ? err.message : 'Failed to fetch verification or risk data');
        }
      } finally {
        if (gen === fetchGenRef.current) {
          setIsLoadingData(false);
        }
      }
    },
    [activeOrgId]
  );

  useEffect(() => {
    if (selectedDocId) {
      loadDocData(selectedDocId);
    }
  }, [selectedDocId, loadDocData]);

  const handleExecuteVerification = async () => {
    if (!selectedDocId) return;
    setIsVerifying(true);
    setErrorNotice(null);
    try {
      await findingsApi.executeVerification(activeOrgId, selectedDocId, { force: true });
      setSuccessBanner('Independent QA verification executed successfully.');
      await loadDocData(selectedDocId);
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Verification execution failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExecuteRisk = async () => {
    if (!selectedDocId) return;
    setIsEvaluatingRisk(true);
    setErrorNotice(null);
    try {
      await findingsApi.executeRiskAnalysis(activeOrgId, selectedDocId, { force: true });
      setSuccessBanner('Re-identification risk evaluation executed successfully.');
      await loadDocData(selectedDocId);
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Risk evaluation failed.');
    } finally {
      setIsEvaluatingRisk(false);
    }
  };

  const tabs = [
    { id: 'verification', label: '9-Verifier Independent QA' },
    { id: 'risk', label: 'Re-Identification Risk Analysis' },
  ];

  const verifiers = [
    { name: 'Transformation Verifier', code: 'TRANSFORMATION_VERIFIER', desc: 'Validates mutated artifact state consistency and decision compliance.' },
    { name: 'Metadata Verifier', code: 'METADATA_VERIFIER', desc: 'Verifies complete stripping of EXIF, author, revision, and hidden properties.' },
    { name: 'PII Residual Verifier', code: 'PII_RESIDUAL_VERIFIER', desc: 'Representation-aware independent extraction checking for prohibited sensitive tokens.' },
    { name: 'Policy Verifier', code: 'POLICY_VERIFIER', desc: 'Ensures executed output strictly satisfies active tenant policy decision.' },
    { name: 'Provenance Verifier', code: 'PROVENANCE_VERIFIER', desc: 'Verifies unbroken cryptographic parentage and pipeline execution chain.' },
    { name: 'Checksum Verifier', code: 'CHECKSUM_VERIFIER', desc: 'Confirms immutable source file sha256 matches and output hash matches record.' },
    { name: 'Structural Integrity Verifier', code: 'STRUCTURAL_INTEGRITY_VERIFIER', desc: 'Validates output archive streams (ZIP/XML/PDF) are non-corrupted and parsable.' },
    { name: 'Risk Consistency Verifier', code: 'RISK_CONSISTENCY_VERIFIER', desc: 'Ensures reported risk level aligns with residual candidate findings.' },
    { name: 'Artifact Integrity Verifier', code: 'ARTIFACT_INTEGRITY_VERIFIER', desc: 'Verifies output artifact storage location, access bounds, and byte constraints.' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk Analysis & Independent Verification"
        description="Dual-engine assurance: 9-verifier representation-aware QA coupled with deterministic re-identification risk scoring."
      />

      {successBanner && (
        <Alert variant="success" title="Success" onDismiss={() => setSuccessBanner(null)}>
          {successBanner}
        </Alert>
      )}

      {errorNotice && (
        <Alert variant="critical" title="Notice" onDismiss={() => setErrorNotice(null)}>
          {errorNotice}
        </Alert>
      )}

      {/* Document Selector Header */}
      <div className="p-4 rounded-lg bg-surface-white border border-surface-border shadow-subtle flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <span className="font-semibold text-brand-deep-teal shrink-0">Selected Document:</span>
          <div className="min-w-[240px] flex-1 md:w-80">
            <Select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
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

        <Button
          variant="outline"
          size="sm"
          onClick={() => selectedDocId && loadDocData(selectedDocId)}
          isLoading={isLoadingData}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Refresh Data
        </Button>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />

      {isLoadingData ? (
        <div className="space-y-4">
          <Skeleton height={60} />
          <Skeleton height={200} />
        </div>
      ) : activeTab === 'verification' ? (
        <div className="space-y-6">
          <IndependentVerificationView
            verificationRun={verificationRun}
            results={verificationResults}
            isVerifying={isVerifying}
            onExecuteVerification={handleExecuteVerification}
          />

          {/* Verifier Reference Card */}
          <Card>
            <CardHeader>
              <CardTitle>9-Verifier Engine Architecture</CardTitle>
              <CardDescription>
                Independent verification checks executed against transformed output artifacts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {verifiers.map((v) => (
                  <div
                    key={v.code}
                    className="p-3 rounded-lg border border-surface-border bg-surface-cool text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-brand-deep-teal">{v.name}</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-teal" />
                    </div>
                    <p className="text-[11px] text-text-secondary leading-relaxed">{v.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <RiskAssessmentView
          riskRun={riskRun}
          isEvaluating={isEvaluatingRisk}
          onExecuteRiskAnalysis={handleExecuteRisk}
        />
      )}
    </div>
  );
};
