import React from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { HumanReviewCase, ReviewDecision } from '../../types/review';
import { Link } from 'react-router-dom';
import {
  X,
  UserCheck,
  Clock,
  ExternalLink,
  FileText,
  Lock,
  Layers,
  CheckCircle2,
} from 'lucide-react';

interface ReviewCaseDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  caseItem: HumanReviewCase | null;
  decisions: ReviewDecision[];
  organizationId: string;
  currentUserId?: string;
  hasReviewExecute: boolean;
  onClaimLease: (caseId: string) => Promise<void>;
  isClaimingLease: boolean;
  onOpenAdjudicationModal: () => void;
}

export const ReviewCaseDetailsDrawer: React.FC<ReviewCaseDetailsDrawerProps> = ({
  isOpen,
  onClose,
  caseItem,
  decisions,
  organizationId,
  currentUserId,
  hasReviewExecute,
  onClaimLease,
  isClaimingLease,
  onOpenAdjudicationModal,
}) => {
  if (!isOpen || !caseItem) return null;

  const now = new Date();
  const leaseExpires = caseItem.leaseExpiresAt ? new Date(caseItem.leaseExpiresAt) : null;
  const isLeaseActive = leaseExpires ? leaseExpires.getTime() > now.getTime() : false;
  const isLeaseOwner = Boolean(currentUserId && caseItem.leaseOwnerId === currentUserId);
  const isLeaseHeldByOther = Boolean(isLeaseActive && caseItem.leaseOwnerId && !isLeaseOwner);

  const canAdjudicate =
    hasReviewExecute &&
    ['OPEN', 'ASSIGNED', 'IN_REVIEW', 'AWAITING_SECOND_REVIEW'].includes(caseItem.status) &&
    !isLeaseHeldByOther;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl bg-surface-white border-l border-surface-border shadow-2xl flex flex-col animate-slide-left">
      {/* Header */}
      <div className="p-4 border-b border-surface-border bg-surface-cool/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-brand-teal" />
          <div>
            <h2 className="text-sm font-bold text-brand-deep-teal font-mono">
              {caseItem.reviewCaseId}
            </h2>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-muted">
              <span>Version: v{caseItem.caseVersion}</span>
              <span>•</span>
              <span>Priority: {caseItem.priority}</span>
              <span>•</span>
              <span className="font-mono">Org: {organizationId}</span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0 text-text-muted hover:text-text-primary"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Body Content */}
      <div className="p-4 flex-1 overflow-y-auto space-y-5 text-xs">
        {/* Status & Document Link Card */}
        <div className="p-3 rounded-lg border border-surface-border bg-surface-white shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-[11px] text-text-muted block">Lifecycle Status</span>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant={
                  caseItem.status === 'RESOLVED'
                    ? 'success'
                    : caseItem.status === 'REJECTED' || caseItem.status === 'ESCALATED'
                      ? 'critical'
                      : 'warning'
                }
              >
                {caseItem.status}
              </Badge>
              <Badge variant="teal">{caseItem.caseType}</Badge>
            </div>
          </div>

          <Link
            to={`/findings?documentId=${caseItem.documentId}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold text-brand-teal hover:text-brand-deep-teal bg-brand-pale-teal border border-brand-teal/30 hover:border-brand-teal transition-colors"
            title="Inspect in Findings Workspace"
          >
            <FileText className="w-3.5 h-3.5" />
            Inspect Findings
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {/* 15-Minute Concurrency Lease Card */}
        <div className="p-3 rounded-lg border border-surface-border bg-surface-cool/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-brand-deep-teal flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-teal" />
              Reviewer Concurrency Lease (15 Min)
            </span>
            {isLeaseOwner ? (
              <Badge variant="success">Your Active Lease</Badge>
            ) : isLeaseHeldByOther ? (
              <Badge variant="critical">Locked by Reviewer</Badge>
            ) : (
              <Badge variant="neutral">Available to Claim</Badge>
            )}
          </div>

          {isLeaseHeldByOther ? (
            <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong>Active Lease Held:</strong> Another reviewer holds the atomic adjudication lease.
                Lease expires at{' '}
                <span className="font-mono tabular-nums">
                  {leaseExpires?.toLocaleTimeString() || 'soon'}
                </span>
                . If the reviewer becomes inactive, the lease automatically expires back to OPEN.
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[11px] text-text-secondary pt-1">
              <span>
                {isLeaseOwner
                  ? `Active lease expires: ${leaseExpires?.toLocaleTimeString() || 'N/A'}`
                  : 'Claim the case lease to prevent concurrent race collisions while you review.'}
              </span>
              {hasReviewExecute && !isLeaseOwner && caseItem.status !== 'RESOLVED' && caseItem.status !== 'REJECTED' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onClaimLease(caseItem.reviewCaseId)}
                  isLoading={isClaimingLease}
                  className="h-7 text-xs px-2.5"
                  leftIcon={<Clock className="w-3 h-3" />}
                >
                  Claim Lease
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Reason Codes */}
        {caseItem.reasonCodes && caseItem.reasonCodes.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-text-secondary block">
              Flagged Reason Codes:
            </span>
            <div className="flex flex-wrap gap-1">
              {caseItem.reasonCodes.map((rc, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded bg-surface-cool border border-surface-border text-brand-deep-teal font-mono text-[10px]"
                >
                  {rc}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Safe Evidence References */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-brand-deep-teal flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-brand-teal" />
            Supporting Candidate Evidence ({caseItem.safeEvidenceReferences?.length || 0})
          </span>

          {!caseItem.safeEvidenceReferences || caseItem.safeEvidenceReferences.length === 0 ? (
            <div className="p-3 text-center border border-dashed border-surface-border rounded bg-surface-cool/30 text-text-muted text-[11px]">
              No granular evidence references attached to this case.
            </div>
          ) : (
            <div className="space-y-2">
              {caseItem.safeEvidenceReferences.map((ev, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded border border-surface-border bg-surface-white shadow-subtle space-y-1 text-[11px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-brand-deep-teal font-mono">
                      {ev.piiType || 'UNKNOWN_TYPE'}
                    </span>
                    <span className="text-text-muted font-mono text-[10px]">
                      {ev.candidateId || `Item ${i + 1}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-text-secondary pt-0.5">
                    <div>
                      <span className="text-text-muted block text-[10px]">Location:</span>
                      <span>{ev.locationLabel || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px]">Expected Action:</span>
                      <span className="font-semibold text-brand-teal">{ev.expectedAction || 'REVIEW'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Decision History Log */}
        <div className="space-y-2 pt-2 border-t border-surface-border">
          <span className="text-xs font-semibold text-brand-deep-teal flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
            Adjudication History Log ({decisions.length})
          </span>

          {decisions.length === 0 ? (
            <p className="text-[11px] text-text-muted italic">
              No historical decisions recorded for this case yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {decisions.map((dec) => (
                <div
                  key={dec.reviewDecisionId}
                  className="p-3 rounded border border-surface-border bg-surface-cool/30 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-text-primary">
                        #{dec.decisionSequence}: {dec.decisionType}
                      </span>
                      {dec.isSecondReview && <Badge variant="warning">2nd Review</Badge>}
                    </div>
                    <span className="text-[10px] text-text-muted tabular-nums">
                      {new Date(dec.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-text-secondary text-[11px] bg-surface-white p-2 rounded border border-surface-border/70 font-sans">
                    <strong>Rationale:</strong> {dec.safeRationale}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-text-muted pt-1">
                    <span>Reason: <code>{dec.reasonCode}</code></span>
                    <span>Next: <code>{dec.expectedNextAction}</code></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-surface-border bg-surface-cool/30 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onClose}>
          Close Details
        </Button>

        {canAdjudicate ? (
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenAdjudicationModal}
            leftIcon={<UserCheck className="w-3.5 h-3.5" />}
          >
            Adjudicate Case
          </Button>
        ) : (
          <span className="text-[11px] text-text-muted italic">
            {caseItem.status === 'RESOLVED'
              ? 'Case is already resolved.'
              : isLeaseHeldByOther
                ? 'Case lease locked by another reviewer.'
                : 'REVIEW_EXECUTE permission required.'}
          </span>
        )}
      </div>
    </div>
  );
};
