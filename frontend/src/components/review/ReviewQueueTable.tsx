import React from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { HumanReviewCase } from '../../types/review';
import { ChevronRight, Clock, FileText, UserCheck } from 'lucide-react';

interface ReviewQueueTableProps {
  cases: HumanReviewCase[];
  selectedCaseId: string | null;
  onSelectCase: (caseItem: HumanReviewCase) => void;
  currentUserId?: string;
}

export const ReviewQueueTable: React.FC<ReviewQueueTableProps> = ({
  cases,
  selectedCaseId,
  onSelectCase,
  currentUserId,
}) => {
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="neutral">OPEN</Badge>;
      case 'ASSIGNED':
        return <Badge variant="info">ASSIGNED</Badge>;
      case 'IN_REVIEW':
        return <Badge variant="warning">IN REVIEW</Badge>;
      case 'AWAITING_SECOND_REVIEW':
        return <Badge variant="warning">2ND REVIEW REQ</Badge>;
      case 'ESCALATED':
        return <Badge variant="critical">ESCALATED</Badge>;
      case 'RESOLVED':
        return <Badge variant="success">RESOLVED</Badge>;
      case 'REJECTED':
        return <Badge variant="critical">REJECTED</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">CANCELLED</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const renderPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
      case 'CRITICAL':
        return <Badge variant="critical">URGENT</Badge>;
      case 'HIGH':
        return <Badge variant="warning">HIGH</Badge>;
      case 'MEDIUM':
        return <Badge variant="info">MEDIUM</Badge>;
      case 'LOW':
      default:
        return <Badge variant="neutral">LOW</Badge>;
    }
  };

  const formatLeaseStatus = (c: HumanReviewCase) => {
    if (!c.leaseOwnerId || !c.leaseExpiresAt) {
      return <span className="text-text-muted">Unleased</span>;
    }

    const now = new Date();
    const expires = new Date(c.leaseExpiresAt);
    const diffMs = expires.getTime() - now.getTime();

    if (diffMs <= 0) {
      return <span className="text-status-warning text-[11px] font-medium">Lease Expired</span>;
    }

    const minsLeft = Math.ceil(diffMs / (60 * 1000));
    const isMe = currentUserId && c.leaseOwnerId === currentUserId;

    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-medium ${
          isMe ? 'text-brand-deep-teal font-semibold' : 'text-amber-700'
        }`}
      >
        <Clock className="w-3 h-3" />
        {isMe ? `My Lease (${minsLeft}m)` : `Locked (${minsLeft}m)`}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-white shadow-subtle">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Case Identifier</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Lease Status</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cases.map((c) => {
            const isSelected = selectedCaseId === c.reviewCaseId;
            return (
              <TableRow
                key={c.reviewCaseId}
                className={`cursor-pointer transition-colors ${
                  isSelected ? 'bg-brand-pale-teal/60 font-medium' : 'hover:bg-surface-cool/50'
                }`}
                onClick={() => onSelectCase(c)}
              >
                <TableCell className="font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-brand-teal shrink-0" />
                    <span className="font-semibold text-brand-deep-teal">{c.reviewCaseId}</span>
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <span>Doc: {c.documentId?.substring(0, 8)}...</span>
                  </div>
                </TableCell>
                <TableCell>{renderPriorityBadge(c.priority)}</TableCell>
                <TableCell className="text-xs">
                  <span className="font-mono text-[11px] text-text-secondary bg-surface-cool px-1.5 py-0.5 rounded border border-surface-border">
                    {c.caseType}
                  </span>
                </TableCell>
                <TableCell>{renderStatusBadge(c.status)}</TableCell>
                <TableCell>{formatLeaseStatus(c)}</TableCell>
                <TableCell className="font-mono text-xs tabular-nums text-text-secondary">
                  v{c.caseVersion}
                </TableCell>
                <TableCell className="text-xs text-text-muted tabular-nums">
                  {new Date(c.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2 text-brand-teal hover:text-brand-deep-teal"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCase(c);
                    }}
                  >
                    Inspect
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
