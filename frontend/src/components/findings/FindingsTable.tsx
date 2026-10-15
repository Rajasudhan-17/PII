import React, { useState, useMemo } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { PIICandidateItem } from '../../types/pii';
import { Search, ArrowUpDown, Eye, Tag, XCircle } from 'lucide-react';

interface FindingsTableProps {
  findings: PIICandidateItem[];
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
}

export const FindingsTable: React.FC<FindingsTableProps> = ({
  findings,
  selectedFindingId,
  onSelectFinding,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [decisionFilter, setDecisionFilter] = useState('ALL');
  const [sortField, setSortField] = useState<'offset' | 'confidence' | 'severity' | 'type'>('offset');
  const [sortAsc, setSortAsc] = useState(true);

  // Filtered findings
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesType = f.type.toLowerCase().includes(query);
        const matchesCategory = (f.category || '').toLowerCase().includes(query);
        const matchesDetector = (f.detectorName || '').toLowerCase().includes(query);
        const matchesText = (f.text || '').toLowerCase().includes(query);
        if (!matchesType && !matchesCategory && !matchesDetector && !matchesText) {
          return false;
        }
      }

      if (severityFilter !== 'ALL' && f.severity !== severityFilter) {
        return false;
      }

      if (decisionFilter !== 'ALL') {
        const decision = f.decision || 'PENDING';
        if (decision !== decisionFilter) {
          return false;
        }
      }

      return true;
    });
  }, [findings, searchQuery, severityFilter, decisionFilter]);

  // Sorted findings
  const sortedFindings = useMemo(() => {
    return [...filteredFindings].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'confidence':
          comparison = (a.confidence || 0) - (b.confidence || 0);
          break;
        case 'severity': {
          const rank: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
          comparison = (rank[a.severity] || 0) - (rank[b.severity] || 0);
          break;
        }
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'offset':
        default:
          comparison = (a.location?.startOffset || 0) - (b.location?.startOffset || 0);
          break;
      }
      return sortAsc ? comparison : -comparison;
    });
  }, [filteredFindings, sortField, sortAsc]);

  const handleToggleSort = (field: 'offset' | 'confidence' | 'severity' | 'type') => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const renderSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <Badge variant="critical">CRITICAL</Badge>;
      case 'HIGH':
        return <Badge variant="critical">HIGH</Badge>;
      case 'MEDIUM':
        return <Badge variant="warning">MEDIUM</Badge>;
      case 'LOW':
      default:
        return <Badge variant="neutral">LOW</Badge>;
    }
  };

  const renderDecisionBadge = (decision?: string | null) => {
    switch (decision) {
      case 'REDACT':
        return <Badge variant="critical">REDACT</Badge>;
      case 'REVIEW':
        return <Badge variant="warning">REVIEW</Badge>;
      case 'KEEP':
        return <Badge variant="success">KEEP</Badge>;
      default:
        return <Badge variant="neutral">PENDING</Badge>;
    }
  };

  const isFiltersActive = searchQuery.trim() !== '' || severityFilter !== 'ALL' || decisionFilter !== 'ALL';

  return (
    <div className="space-y-3">
      {/* Search and Filters */}
      <div className="p-3 rounded-lg bg-surface-white border border-surface-border shadow-subtle flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-1 items-center gap-2 min-w-[200px]">
          <Input
            placeholder="Search findings by type, category, or detector..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-3.5 h-3.5" />}
            className="h-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="w-32">
            <Select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Severities' },
                { value: 'CRITICAL', label: 'Critical' },
                { value: 'HIGH', label: 'High' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'LOW', label: 'Low' },
              ]}
              className="h-8 text-xs"
            />
          </div>

          <div className="w-32">
            <Select
              value={decisionFilter}
              onChange={(e) => setDecisionFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Decisions' },
                { value: 'REDACT', label: 'Redact' },
                { value: 'REVIEW', label: 'Review' },
                { value: 'KEEP', label: 'Keep' },
                { value: 'PENDING', label: 'Pending' },
              ]}
              className="h-8 text-xs"
            />
          </div>

          {isFiltersActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSeverityFilter('ALL');
                setDecisionFilter('ALL');
              }}
              className="h-8 px-2 text-text-muted hover:text-text-primary"
            >
              <XCircle className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Findings Table */}
      <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-white shadow-subtle">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  onClick={() => handleToggleSort('type')}
                  className="flex items-center gap-1 font-semibold text-text-secondary hover:text-text-primary focus:outline-none"
                >
                  Entity Type
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead>Category</TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => handleToggleSort('severity')}
                  className="flex items-center gap-1 font-semibold text-text-secondary hover:text-text-primary focus:outline-none"
                >
                  Severity
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => handleToggleSort('confidence')}
                  className="flex items-center gap-1 font-semibold text-text-secondary hover:text-text-primary focus:outline-none"
                >
                  Confidence
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => handleToggleSort('offset')}
                  className="flex items-center gap-1 font-semibold text-text-secondary hover:text-text-primary focus:outline-none"
                >
                  Location
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead>Policy Decision</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedFindings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-text-secondary">
                  No PII candidate findings match current filters.
                </TableCell>
              </TableRow>
            ) : (
              sortedFindings.map((finding) => {
                const isSelected = selectedFindingId === finding.candidateId;
                return (
                  <TableRow
                    key={finding.candidateId}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-brand-pale-teal/60 font-medium' : 'hover:bg-surface-cool/60'
                    }`}
                    onClick={() => onSelectFinding(finding.candidateId)}
                  >
                    <TableCell className="font-semibold text-brand-deep-teal">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-brand-teal shrink-0" />
                        <span className="font-mono text-xs">{finding.type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-text-secondary">
                        {finding.category || 'IDENTIFIER'}
                      </span>
                    </TableCell>
                    <TableCell>{renderSeverityBadge(finding.severity)}</TableCell>
                    <TableCell className="tabular-nums text-xs">
                      <span className="font-semibold text-text-primary">
                        {(finding.confidence * 100).toFixed(1)}%
                      </span>
                      {typeof finding.detectionScore === 'number' && (
                        <span className="text-text-muted text-[10px] ml-1">
                          (score: {finding.detectionScore.toFixed(2)})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-text-secondary">
                      {typeof finding.location?.startOffset === 'number' ? (
                        <span>
                          {typeof finding.location?.pageNumber === 'number'
                            ? `P.${finding.location.pageNumber} `
                            : ''}
                          [{finding.location.startOffset}–{finding.location.endOffset}]
                        </span>
                      ) : (
                        <span className="text-text-muted italic">No offset</span>
                      )}
                    </TableCell>
                    <TableCell>{renderDecisionBadge(finding.decision)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={isSelected ? 'primary' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectFinding(finding.candidateId);
                        }}
                        leftIcon={<Eye className="w-3 h-3" />}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
