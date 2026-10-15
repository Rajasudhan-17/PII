import React, { useEffect, useState, useCallback, useRef } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { EmptyState } from '../components/ui/EmptyState';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { ReviewQueueTable } from '../components/review/ReviewQueueTable';
import { ReviewCaseDetailsDrawer } from '../components/review/ReviewCaseDetailsDrawer';
import { AdjudicationModal } from '../components/review/AdjudicationModal';
import { reviewApi } from '../api/review.api';
import { useAuth } from '../context/AuthContext';
import { HumanReviewCase, ReviewDecision } from '../types/review';
import {
  UserCheck,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

export const HumanReviewPage: React.FC = () => {
  const { currentOrgId, user, hasPermission } = useAuth();
  const activeOrgId = currentOrgId || 'org_primary';

  const [cases, setCases] = useState<HumanReviewCase[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const [selectedCase, setSelectedCase] = useState<HumanReviewCase | null>(null);
  const [selectedCaseDecisions, setSelectedCaseDecisions] = useState<ReviewDecision[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAdjudicateModalOpen, setIsAdjudicateModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isClaimingLease, setIsClaimingLease] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Stale-response & multi-tenant protection refs
  const activeOrgIdRef = useRef(activeOrgId);
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    activeOrgIdRef.current = activeOrgId;
  }, [activeOrgId]);

  // Load Review Queue from Backend
  const loadReviewQueue = useCallback(async () => {
    if (!hasPermission('REVIEW_READ')) return;

    const currentGen = ++fetchGenerationRef.current;
    const targetOrg = activeOrgId;

    setIsLoading(true);
    setErrorNotice(null);

    try {
      const res = await reviewApi.listCases(targetOrg, {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        priority: priorityFilter === 'ALL' ? undefined : priorityFilter,
        page,
        limit: pageSize,
      });

      if (currentGen !== fetchGenerationRef.current || activeOrgIdRef.current !== targetOrg) {
        return;
      }

      setCases(res.data?.cases || []);
      setTotalCount(res.data?.pagination?.total || (res.data?.cases?.length || 0));
    } catch (err: unknown) {
      if (currentGen === fetchGenerationRef.current) {
        setErrorNotice(err instanceof Error ? err.message : 'Failed to query review queue');
      }
    } finally {
      if (currentGen === fetchGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }, [activeOrgId, statusFilter, priorityFilter, page, hasPermission]);

  // Flush state when organization switches
  useEffect(() => {
    setCases([]);
    setTotalCount(0);
    setPage(1);
    setSelectedCase(null);
    setSelectedCaseDecisions([]);
    setIsDrawerOpen(false);
    setIsAdjudicateModalOpen(false);
    setErrorNotice(null);
    setSuccessBanner(null);

    loadReviewQueue();
  }, [activeOrgId, loadReviewQueue]);

  // Fetch full details and history when a case is selected
  const handleSelectCase = async (caseItem: HumanReviewCase) => {
    setSelectedCase(caseItem);
    setIsDrawerOpen(true);
    try {
      const res = await reviewApi.getCase(activeOrgId, caseItem.reviewCaseId);
      if (res.data?.reviewCase) {
        setSelectedCase(res.data.reviewCase);
        setSelectedCaseDecisions(res.data.decisions || []);
      }
    } catch {
      // Retain existing item if detailed history fails
    }
  };

  // Claim Case Lease
  const handleClaimLease = async (caseId: string) => {
    setIsClaimingLease(true);
    setErrorNotice(null);
    try {
      const res = await reviewApi.claimCase(activeOrgId, caseId);
      if (res.data?.reviewCase) {
        setSelectedCase(res.data.reviewCase);
        setSuccessBanner(`Successfully claimed 15-minute lease for case ${caseId}.`);
        loadReviewQueue();
      }
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to claim lease.');
    } finally {
      setIsClaimingLease(false);
    }
  };

  // Callback on successful decision
  const handleAdjudicationSuccess = () => {
    setSuccessBanner('Adjudication submitted and persisted successfully.');
    setIsDrawerOpen(false);
    loadReviewQueue();
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  if (!hasPermission('REVIEW_READ')) {
    return (
      <div className="space-y-4">
        <PageHeader title="Human Review & Adjudication" />
        <Alert variant="warning" title="Access Restricted">
          Your active organization role does not possess the <code>REVIEW_READ</code> permission
          required to inspect the human review queue.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Human Review Workspace"
        description="Inspect ambiguous or low-confidence policy cases, acquire 15-minute concurrency leases, and record authoritative adjudications."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadReviewQueue}
            isLoading={isLoading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh Queue
          </Button>
        }
      />

      {successBanner && (
        <Alert variant="success" title="Success" onDismiss={() => setSuccessBanner(null)}>
          {successBanner}
        </Alert>
      )}

      {errorNotice && (
        <Alert variant="critical" title="Queue Notice" onDismiss={() => setErrorNotice(null)}>
          {errorNotice}
        </Alert>
      )}

      {/* Queue Metrics Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg bg-surface-white border border-surface-border shadow-subtle">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Total Cases</span>
            <UserCheck className="w-4 h-4 text-brand-teal" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-brand-deep-teal tabular-nums">
            {totalCount}
          </p>
          <span className="text-[11px] text-text-muted">In tenant scope</span>
        </div>

        <div className="p-3.5 rounded-lg bg-surface-white border border-surface-border shadow-subtle">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Pending Action</span>
            <Clock className="w-4 h-4 text-status-warning" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-status-warning tabular-nums">
            {cases.filter((c) => ['OPEN', 'ASSIGNED', 'IN_REVIEW', 'AWAITING_SECOND_REVIEW'].includes(c.status)).length}
          </p>
          <span className="text-[11px] text-text-muted">Awaiting completion</span>
        </div>

        <div className="p-3.5 rounded-lg bg-surface-white border border-surface-border shadow-subtle">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-status-success" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-status-success tabular-nums">
            {cases.filter((c) => c.status === 'RESOLVED').length}
          </p>
          <span className="text-[11px] text-text-muted">Adjudications finalized</span>
        </div>

        <div className="p-3.5 rounded-lg bg-surface-white border border-surface-border shadow-subtle">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Urgent / Critical</span>
            <AlertCircle className="w-4 h-4 text-status-critical" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-status-critical tabular-nums">
            {cases.filter((c) => c.priority === 'URGENT' || c.priority === 'CRITICAL').length}
          </p>
          <span className="text-[11px] text-text-muted">Requires expedited review</span>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="p-4 rounded-lg bg-surface-white border border-surface-border shadow-subtle flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="w-48">
            <span className="text-[11px] text-text-muted block mb-1">Status Filter:</span>
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'OPEN', label: 'OPEN — Unassigned' },
                { value: 'ASSIGNED', label: 'ASSIGNED — Assigned' },
                { value: 'IN_REVIEW', label: 'IN_REVIEW — Leased' },
                { value: 'AWAITING_SECOND_REVIEW', label: 'AWAITING_SECOND_REVIEW — 2nd Review' },
                { value: 'ESCALATED', label: 'ESCALATED — Escalated' },
                { value: 'RESOLVED', label: 'RESOLVED — Completed' },
                { value: 'REJECTED', label: 'REJECTED — Rejected' },
              ]}
            />
          </div>

          <div className="w-44">
            <span className="text-[11px] text-text-muted block mb-1">Priority Filter:</span>
            <Select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: 'All Priorities' },
                { value: 'URGENT', label: 'URGENT Priority' },
                { value: 'HIGH', label: 'HIGH Priority' },
                { value: 'MEDIUM', label: 'MEDIUM Priority' },
                { value: 'LOW', label: 'LOW Priority' },
              ]}
            />
          </div>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted tabular-nums">
            Page {page} of {totalPages} ({totalCount} cases)
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => p + 1)}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main Review Queue View */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton height={50} />
          <Skeleton height={50} />
          <Skeleton height={50} />
        </div>
      ) : cases.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="w-8 h-8 text-brand-teal" />}
          title="Review Queue is Clear"
          description={`No review cases match current filters in organization [${activeOrgId}]. Documents evaluated to REVIEW by tenant privacy policies will automatically appear here.`}
        />
      ) : (
        <ReviewQueueTable
          cases={cases}
          selectedCaseId={selectedCase?.reviewCaseId || null}
          onSelectCase={handleSelectCase}
          currentUserId={user?.id}
        />
      )}

      {/* Side Details Drawer */}
      <ReviewCaseDetailsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        caseItem={selectedCase}
        decisions={selectedCaseDecisions}
        organizationId={activeOrgId}
        currentUserId={user?.id}
        hasReviewExecute={hasPermission('REVIEW_EXECUTE')}
        onClaimLease={handleClaimLease}
        isClaimingLease={isClaimingLease}
        onOpenAdjudicationModal={() => setIsAdjudicateModalOpen(true)}
      />

      {/* Adjudication Modal */}
      <AdjudicationModal
        isOpen={isAdjudicateModalOpen}
        onClose={() => setIsAdjudicateModalOpen(false)}
        organizationId={activeOrgId}
        caseItem={selectedCase}
        onAdjudicationSuccess={handleAdjudicationSuccess}
      />
    </div>
  );
};
