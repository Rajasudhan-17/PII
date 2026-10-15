import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { documentsApi } from '../api/documents.api';
import { reviewApi } from '../api/review.api';
import { policiesApi } from '../api/policies.api';
import { systemApi, HealthReport } from '../api/system.api';
import { findingsApi } from '../api/findings.api';
import { useAuth } from '../context/AuthContext';
import { DocumentItem } from '../types/document';
import { HumanReviewCase } from '../types/review';
import { Policy } from '../types/policy';
import {
  Activity,
  FileText,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  Clock,
  ExternalLink,
  Layers,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface PIISummaryData {
  documentId: string;
  totalCandidates: number;
  byCategory: Record<string, number>;
}

interface DecisionSummaryData {
  documentId: string;
  keepCount: number;
  reviewCount: number;
  redactCount: number;
}

export const DashboardPage: React.FC = () => {
  const { user, currentOrgId, hasPermission } = useAuth();
  const activeOrgId = currentOrgId || 'org_primary';

  // State
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [reviewCases, setReviewCases] = useState<HumanReviewCase[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [samplePII, setSamplePII] = useState<PIISummaryData | null>(null);
  const [sampleDecisions, setSampleDecisions] = useState<DecisionSummaryData | null>(null);
  const [systemHealth, setSystemHealth] = useState<HealthReport | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const fetchGenerationRef = useRef(0);
  const activeOrgIdRef = useRef(activeOrgId);
  activeOrgIdRef.current = activeOrgId;

  // Load Dashboard Data with Race Condition & Stale Tenant Guards
  const loadDashboardData = useCallback(async (isManualRefresh = false) => {
    const currentGen = ++fetchGenerationRef.current;
    if (isManualRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorNotice(null);

    // Synchronously flush previous tenant state
    if (!isManualRefresh) {
      setDocuments([]);
      setReviewCases([]);
      setPolicies([]);
      setSamplePII(null);
      setSampleDecisions(null);
    }

    try {
      // 1. Fetch Tenant Documents (if permitted)
      const docPromise = hasPermission('DOCUMENT_READ')
        ? documentsApi.listDocuments(activeOrgId).catch(() => ({ count: 0, documents: [] }))
        : Promise.resolve({ count: 0, documents: [] });

      // 2. Fetch Human Review Cases (if permitted)
      const reviewPromise = hasPermission('REVIEW_READ')
        ? reviewApi.listCases(activeOrgId, { limit: 100 }).catch(() => ({ data: { cases: [] } }))
        : Promise.resolve({ data: { cases: [] } });

      // 3. Fetch Policies (if permitted)
      const policyPromise = hasPermission('POLICY_READ')
        ? policiesApi.listPolicies(activeOrgId).catch(() => ({ data: { policies: [] } }))
        : Promise.resolve({ data: { policies: [] } });

      // 4. Fetch System Health Probes
      const healthPromise = systemApi.getHealth().catch(() => null);

      const [docRes, reviewRes, policyRes, healthRes] = await Promise.all([
        docPromise,
        reviewPromise,
        policyPromise,
        healthPromise,
      ]);

      if (currentGen !== fetchGenerationRef.current || activeOrgIdRef.current !== activeOrgId) {
        return;
      }

      const fetchedDocs = docRes.documents || [];
      const fetchedCases = reviewRes.data?.cases || [];
      const fetchedPolicies = policyRes.data?.policies || [];

      setDocuments(fetchedDocs);
      setReviewCases(fetchedCases);
      setPolicies(fetchedPolicies);
      setSystemHealth(healthRes);
      setLastRefreshedAt(new Date());

      // 5. Sample Most Recent Document for PII Findings & Decision Distributions
      if (fetchedDocs.length > 0 && hasPermission('DOCUMENT_READ')) {
        let sampledPII: { totalCandidates: number; byCategory: Record<string, number>; documentId: string } | null = null;
        let sampledDecisions: { keepCount: number; reviewCount: number; redactCount: number; documentId: string } | null = null;

        for (const doc of fetchedDocs.slice(0, 8)) {
          try {
            if (!sampledPII) {
              const piiRes = await findingsApi.getDetectionSummary(activeOrgId, doc.id).catch(() => null);
              if (piiRes && piiRes.data) {
                const pData = piiRes.data as any;
                if ((pData.totalCandidates || 0) > 0) {
                  const categories = pData.byCategory || pData.categories || {};
                  sampledPII = {
                    documentId: doc.id,
                    totalCandidates: pData.totalCandidates || 0,
                    byCategory: categories,
                  };
                }
              }
            }

            if (!sampledDecisions) {
              const decisionRes = await findingsApi.getDecisions(activeOrgId, doc.id).catch(() => null);
              if (decisionRes && decisionRes.data) {
                const summary = decisionRes.data.run?.decisionsSummary as any;
                const keep = summary?.KEEP ?? summary?.keepCount ?? 0;
                const review = summary?.REVIEW ?? summary?.reviewCount ?? 0;
                const redact = summary?.REDACT ?? summary?.redactCount ?? 0;
                if (keep + review + redact > 0) {
                  sampledDecisions = {
                    documentId: doc.id,
                    keepCount: keep,
                    reviewCount: review,
                    redactCount: redact,
                  };
                }
              }
            }

            if (sampledPII && sampledDecisions) break;
          } catch {
            // Gracefully inspect next document
          }
        }

        if (currentGen !== fetchGenerationRef.current || activeOrgIdRef.current !== activeOrgId) return;

        if (sampledPII) setSamplePII(sampledPII);
        if (sampledDecisions) setSampleDecisions(sampledDecisions);
      }
    } catch (err: unknown) {
      if (currentGen !== fetchGenerationRef.current || activeOrgIdRef.current !== activeOrgId) return;
      setErrorNotice(err instanceof Error ? err.message : 'Failed to aggregate dashboard analytics.');
    } finally {
      if (currentGen === fetchGenerationRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [activeOrgId, hasPermission]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Derived Document Analytics
  const docMetrics = useMemo(() => {
    const total = documents.length;
    let completed = 0;
    let failed = 0;
    let inFlight = 0;
    let totalBytes = 0;
    const formatCounts: Record<string, number> = {};

    for (const doc of documents) {
      totalBytes += doc.size || 0;
      const st = doc.status?.toUpperCase() || '';
      if (
        st === 'READY' ||
        st === 'COMPLETED' ||
        st === 'EXTRACTED' ||
        st === 'OCR_COMPLETED' ||
        st === 'ENCRYPTED'
      ) {
        completed++;
      } else if (st === 'FAILED' || st.includes('FAILED') || st === 'REJECTED') {
        failed++;
      } else {
        inFlight++;
      }

      // Formats breakdown
      const mime = (doc.detectedMimeType || doc.declaredMimeType || doc.extension || 'unknown').toLowerCase();
      let fmt = 'OTHER';
      if (mime.includes('pdf')) fmt = 'PDF';
      else if (mime.includes('word') || mime.includes('officedocument') || mime.includes('docx')) fmt = 'DOCX';
      else if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('xlsx') || mime.includes('csv')) fmt = 'CSV/SHEET';
      else if (mime.includes('text') || mime.includes('.txt')) fmt = 'TXT';
      else if (mime.includes('image') || mime.includes('.png') || mime.includes('.jpg')) fmt = 'IMAGE';

      formatCounts[fmt] = (formatCounts[fmt] || 0) + 1;
    }

    return { total, completed, failed, inFlight, totalBytes, formatCounts };
  }, [documents]);

  // Derived Review Queue Analytics
  const reviewMetrics = useMemo(() => {
    const total = reviewCases.length;
    let pending = 0;
    let resolved = 0;
    let rejected = 0;
    let activeLeases = 0;
    const priorityCounts: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    const now = new Date();
    for (const c of reviewCases) {
      const st = c.status?.toUpperCase() || '';
      if (st === 'RESOLVED' || st.startsWith('RESOLVED')) resolved++;
      else if (st === 'REJECTED' || st === 'CANCELLED') rejected++;
      else pending++;

      const prio = c.priority === 'URGENT' ? 'CRITICAL' : c.priority?.toUpperCase();
      if (prio && priorityCounts[prio] !== undefined) {
        priorityCounts[prio]++;
      }

      if (c.leaseExpiresAt && new Date(c.leaseExpiresAt) > now && c.leaseOwnerId) {
        activeLeases++;
      }
    }

    return { total, pending, resolved, rejected, activeLeases, priorityCounts };
  }, [reviewCases]);

  // Derived Policy Analytics
  const policyMetrics = useMemo(() => {
    const total = policies.length;
    let published = 0;
    let totalRules = 0;
    const fallbackDecisions: Record<string, number> = { KEEP: 0, REVIEW: 0, REDACT: 0 };

    for (const p of policies) {
      if (p.status === 'PUBLISHED') published++;
      totalRules += p.rules?.length || 0;
      if (p.defaultDecision && fallbackDecisions[p.defaultDecision] !== undefined) {
        fallbackDecisions[p.defaultDecision]++;
      }
    }

    return { total, published, totalRules, fallbackDecisions };
  }, [policies]);

  // Format File Size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Privacy Operations Dashboard"
        description="Unified operational intelligence, document processing distributions, policy outcomes, and real-time backend readiness."
        badge={
          <Badge variant="teal" size="sm">
            Operational Dashboard
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDashboardData(true)}
              isLoading={isRefreshing}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh Metrics
            </Button>
          </div>
        }
      />

      {errorNotice && (
        <Alert variant="critical" title="Aggregation Error">
          {errorNotice}
        </Alert>
      )}

      {/* Top Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Ingested Documents */}
        <Card className="hover:border-brand-teal/40 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">Ingested Documents</span>
              <FileText className="w-4 h-4 text-brand-teal" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-brand-deep-teal mt-1">
              {isLoading ? <Skeleton className="h-8 w-16" /> : docMetrics.total}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Success: <strong className="text-status-success">{docMetrics.completed}</strong></span>
              <span>Errors: <strong className="text-status-critical">{docMetrics.failed}</strong></span>
              <span>In-Flight: <strong className="text-brand-teal">{docMetrics.inFlight}</strong></span>
            </div>
            {hasPermission('DOCUMENT_READ') && (
              <Link
                to="/documents"
                className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-brand-teal hover:underline"
              >
                Inspect Documents <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Human Review Queue Backlog */}
        <Card className="hover:border-brand-teal/40 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">Human Review Backlog</span>
              <UserCheck className="w-4 h-4 text-brand-teal" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-brand-deep-teal mt-1">
              {isLoading ? <Skeleton className="h-8 w-16" /> : reviewMetrics.pending}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Total: <strong className="text-text-primary">{reviewMetrics.total}</strong></span>
              <span>Resolved: <strong className="text-status-success">{reviewMetrics.resolved}</strong></span>
              <span>Leased: <strong className="text-brand-teal">{reviewMetrics.activeLeases}</strong></span>
            </div>
            {hasPermission('REVIEW_READ') && (
              <Link
                to="/human-review"
                className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-brand-teal hover:underline"
              >
                Open Review Queue <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Configured Privacy Policies */}
        <Card className="hover:border-brand-teal/40 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">Active Policies</span>
              <ShieldAlert className="w-4 h-4 text-brand-teal" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-brand-deep-teal mt-1">
              {isLoading ? <Skeleton className="h-8 w-16" /> : policyMetrics.published}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Total Policies: <strong className="text-text-primary">{policyMetrics.total}</strong></span>
              <span>Rules: <strong className="text-brand-deep-teal">{policyMetrics.totalRules}</strong></span>
            </div>
            {hasPermission('POLICY_READ') && (
              <Link
                to="/policies"
                className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-brand-teal hover:underline"
              >
                Manage Policies <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Backend & Dependency Readiness */}
        <Card className="hover:border-brand-teal/40 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">Backend Health</span>
              <Activity className="w-4 h-4 text-brand-teal" />
            </div>
            <div className="mt-1 flex items-center gap-2">
              {isLoading && !systemHealth ? (
                <Skeleton className="h-8 w-24" />
              ) : systemHealth?.status === 'ok' ? (
                <Badge variant="success" size="sm">Operational (OK)</Badge>
              ) : (
                <Badge variant="warning" size="sm">Degraded State</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-[11px] text-text-secondary mt-1">
              <span>MongoDB: <strong className="text-text-primary capitalize">{systemHealth?.dependencies.mongodb || 'Unknown'}</strong></span>
              <span>Redis: <strong className="text-text-primary capitalize">{systemHealth?.dependencies.redis || 'Unknown'}</strong></span>
            </div>
            <Link
              to="/system-health"
              className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-brand-teal hover:underline"
            >
              System Health Probes <ArrowRight className="w-3 h-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts & Analytical Distributions Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Document Processing Lifecycle Distribution */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-teal" />
                Document Processing Distribution
              </CardTitle>
              <Badge variant="info" size="sm">Active Organization Scope</Badge>
            </div>
            <CardDescription>
              Real-time processing outcomes for {docMetrics.total} document(s) in active tenant [{activeOrgId}].
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {docMetrics.total === 0 ? (
              <div className="p-6 text-center text-xs text-text-secondary border border-dashed border-surface-border rounded-lg">
                <FileText className="w-8 h-8 text-text-muted mx-auto mb-2" />
                <p className="font-semibold text-text-primary">No documents found in current organization</p>
                <p className="text-[11px] mt-1 text-text-secondary">
                  Upload files via Document Management to initiate extraction, PII detection, and policy evaluation.
                </p>
                {hasPermission('DOCUMENT_UPLOAD') && (
                  <Link to="/documents">
                    <Button variant="outline" size="sm" className="mt-3 text-xs">
                      Upload Document
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <>
                {/* Horizontal Segmented Bar Chart */}
                <div
                  className="space-y-1"
                  role="region"
                  aria-label="Document Processing Status Distribution"
                >
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span>Processing Status Breakdown</span>
                    <span className="font-mono">{docMetrics.total} total</span>
                  </div>

                  {/* Multi-segment progress bar */}
                  <div className="h-4 rounded-full overflow-hidden flex bg-surface-cool border border-surface-border">
                    {docMetrics.completed > 0 && (
                      <div
                        style={{ width: `${(docMetrics.completed / docMetrics.total) * 100}%` }}
                        className="bg-emerald-500 transition-all duration-300"
                        title={`Completed: ${docMetrics.completed}`}
                      />
                    )}
                    {docMetrics.inFlight > 0 && (
                      <div
                        style={{ width: `${(docMetrics.inFlight / docMetrics.total) * 100}%` }}
                        className="bg-brand-teal transition-all duration-300"
                        title={`In-Flight: ${docMetrics.inFlight}`}
                      />
                    )}
                    {docMetrics.failed > 0 && (
                      <div
                        style={{ width: `${(docMetrics.failed / docMetrics.total) * 100}%` }}
                        className="bg-rose-500 transition-all duration-300"
                        title={`Failed: ${docMetrics.failed}`}
                      />
                    )}
                  </div>

                  {/* Legend & Textual Equivalent for Accessibility */}
                  <div className="flex flex-wrap items-center justify-between text-[11px] text-text-secondary pt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                      <span>Completed: <strong>{docMetrics.completed}</strong> ({((docMetrics.completed / docMetrics.total) * 100).toFixed(0)}%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-brand-teal" aria-hidden="true" />
                      <span>In-Flight: <strong>{docMetrics.inFlight}</strong> ({((docMetrics.inFlight / docMetrics.total) * 100).toFixed(0)}%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" aria-hidden="true" />
                      <span>Failed: <strong>{docMetrics.failed}</strong> ({((docMetrics.failed / docMetrics.total) * 100).toFixed(0)}%)</span>
                    </div>
                  </div>
                </div>

                {/* Storage & Formats Row */}
                <div className="pt-3 border-t border-surface-border grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-text-muted block text-[11px]">Storage Volume</span>
                    <span className="font-semibold text-brand-deep-teal font-mono">
                      {formatBytes(docMetrics.totalBytes)}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[11px]">Top Ingested Formats</span>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {Object.entries(docMetrics.formatCounts).map(([fmt, count]) => (
                        <span
                          key={fmt}
                          className="px-1.5 py-0.5 rounded bg-surface-cool border border-surface-border font-mono text-[10px] text-text-primary"
                        >
                          {fmt}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Human Review Queue Priority Breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-brand-teal" />
                Human Review Priority Breakdown
              </CardTitle>
              <Badge variant="teal" size="sm">Case Triage</Badge>
            </div>
            <CardDescription>
              Distribution of review cases by triage urgency and active concurrency leases.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reviewMetrics.total === 0 ? (
              <div className="p-6 text-center text-xs text-text-secondary border border-dashed border-surface-border rounded-lg">
                <UserCheck className="w-8 h-8 text-text-muted mx-auto mb-2" />
                <p className="font-semibold text-text-primary">No human review cases recorded</p>
                <p className="text-[11px] mt-1 text-text-secondary">
                  Review cases are queued when deterministic policies encounter ambiguous PII or low confidence findings.
                </p>
              </div>
            ) : (
              <div className="space-y-3" role="region" aria-label="Review Priority Distribution">
                {/* Priority Levels List */}
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((prio) => {
                  const count = reviewMetrics.priorityCounts[prio] || 0;
                  const pct = reviewMetrics.total > 0 ? (count / reviewMetrics.total) * 100 : 0;
                  const colorClass =
                    prio === 'CRITICAL'
                      ? 'bg-rose-500'
                      : prio === 'HIGH'
                      ? 'bg-amber-500'
                      : prio === 'MEDIUM'
                      ? 'bg-brand-teal'
                      : 'bg-slate-400';

                  return (
                    <div key={prio} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-text-primary">{prio} Priority</span>
                        <span className="font-mono text-text-secondary">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-cool border border-surface-border overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className={`h-full ${colorClass} transition-all duration-300`}
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="pt-3 border-t border-surface-border flex items-center justify-between text-xs text-text-secondary">
                  <span>Exclusive 15-min Leases Held:</span>
                  <span className="font-semibold font-mono text-brand-deep-teal">
                    {reviewMetrics.activeLeases} active lease(s)
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sampling Analysis: PII Findings & Decision Outcomes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PII Detection Sample */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-teal" />
                PII Finding Categories (Document Inspection)
              </CardTitle>
              <Badge variant="info" size="sm">
                {samplePII ? `Doc: ${samplePII.documentId.substring(0, 8)}...` : 'Unavailable'}
              </Badge>
            </div>
            <CardDescription>
              Entity category breakdown from Presidio and contextual NER engine evaluations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!samplePII || samplePII.totalCandidates === 0 ? (
              <div className="p-5 text-center text-xs text-text-secondary border border-dashed border-surface-border rounded-lg">
                <p className="font-medium text-text-primary">No PII candidate statistics evaluated yet</p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Execute PII detection on an ingested document to inspect entity distributions.
                </p>
                {hasPermission('DECISION_READ') && (
                  <Link to="/findings">
                    <Button variant="outline" size="sm" className="mt-3 text-xs">
                      Open Findings & Decisions
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-text-primary">
                  <span>Candidate Breakdown</span>
                  <span className="font-mono text-brand-teal">{samplePII.totalCandidates} Total Findings</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(samplePII.byCategory).map(([cat, count]) => (
                    <div
                      key={cat}
                      className="p-2.5 rounded-lg border border-surface-border bg-surface-cool/50 flex items-center justify-between"
                    >
                      <span className="font-medium text-text-secondary text-[11px] truncate">{cat}</span>
                      <span className="font-mono font-bold text-brand-deep-teal ml-2">{count}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex items-center justify-between text-[11px] text-text-muted">
                  <span>Source: Active Document Detection Run</span>
                  <Link to="/findings" className="text-brand-teal hover:underline font-semibold flex items-center gap-1">
                    View Granular Findings <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Policy Decision Distributions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-teal" />
                Policy Decision Outcomes (KEEP / REVIEW / REDACT)
              </CardTitle>
              <Badge variant="teal" size="sm">Deterministic Engine</Badge>
            </div>
            <CardDescription>
              Outcome counts recorded during policy evaluation against active candidate findings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!sampleDecisions ||
            sampleDecisions.keepCount + sampleDecisions.reviewCount + sampleDecisions.redactCount === 0 ? (
              <div className="p-5 text-center text-xs text-text-secondary border border-dashed border-surface-border rounded-lg">
                <p className="font-medium text-text-primary">No evaluated policy runs recorded yet</p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Evaluate documents against privacy policies to observe automated KEEP, REVIEW, and REDACT actions.
                </p>
                {hasPermission('POLICY_READ') && (
                  <Link to="/policies">
                    <Button variant="outline" size="sm" className="mt-3 text-xs">
                      View Privacy Policies
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                    <span className="text-[11px] font-semibold text-emerald-800 block">KEEP</span>
                    <span className="text-xl font-bold font-mono text-emerald-700 mt-1 block">
                      {sampleDecisions.keepCount}
                    </span>
                    <span className="text-[10px] text-emerald-600">Preserved as Safe</span>
                  </div>

                  <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                    <span className="text-[11px] font-semibold text-amber-800 block">REVIEW</span>
                    <span className="text-xl font-bold font-mono text-amber-700 mt-1 block">
                      {sampleDecisions.reviewCount}
                    </span>
                    <span className="text-[10px] text-amber-600">Queued for Human</span>
                  </div>

                  <div className="p-3 rounded-lg border border-rose-200 bg-rose-50">
                    <span className="text-[11px] font-semibold text-rose-800 block">REDACT</span>
                    <span className="text-xl font-bold font-mono text-rose-700 mt-1 block">
                      {sampleDecisions.redactCount}
                    </span>
                    <span className="text-[10px] text-rose-600">Masked / Mutated</span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-surface-cool border border-surface-border text-[11px] text-text-secondary flex items-start gap-2">
                  <Info className="w-4 h-4 text-brand-teal shrink-0 mt-0.5" />
                  <span>
                    Decisions are evaluated deterministically from priority policy rules. Artifacts with unresolved REVIEW decisions cannot be certified as fully sanitized.
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer Status & Metadata Note */}
      <div className="p-3 rounded-lg border border-surface-border bg-surface-cool/30 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-text-muted gap-2">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>
            Dashboard data updated:{' '}
            <strong className="text-text-primary">
              {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString() : 'Initial load'}
            </strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>Active Organization:</span>
          <span className="font-mono font-semibold text-brand-deep-teal">{activeOrgId}</span>
          <span>•</span>
          <span>User Role:</span>
          <span className="font-semibold text-text-primary">{user?.role || 'VIEWER'}</span>
        </div>
      </div>
    </div>
  );
};
