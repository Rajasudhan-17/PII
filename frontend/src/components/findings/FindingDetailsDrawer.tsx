import React from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { PIICandidateItem } from '../../types/pii';
import { DecisionResultItem } from '../../types/policy';
import {
  Tag,
  Sliders,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  X,
  Cpu,
  Layers,
  AlertTriangle,
} from 'lucide-react';

interface FindingDetailsDrawerProps {
  finding: PIICandidateItem | null;
  decision: DecisionResultItem | null;
  onClose: () => void;
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export const FindingDetailsDrawer: React.FC<FindingDetailsDrawerProps> = ({
  finding,
  decision,
  onClose,
  onNavigatePrevious,
  onNavigateNext,
  hasPrevious = false,
  hasNext = false,
}) => {
  if (!finding) return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface-white shadow-subtle flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-cool/40">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-brand-teal" />
          <div>
            <h3 className="font-semibold text-sm text-brand-deep-teal font-mono">
              {finding.type}
            </h3>
            <span className="text-[11px] text-text-muted">
              ID: {finding.candidateId}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onNavigatePrevious}
            disabled={!hasPrevious}
            title="Previous finding"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onNavigateNext}
            disabled={!hasNext}
            title="Next finding"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-text-muted hover:text-text-primary ml-1"
            onClick={onClose}
            title="Close details"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Body Content - Four Distinct Pillars */}
      <div className="p-4 overflow-y-auto space-y-4 text-xs">
        {/* Pillar 1: Detection (What was found) */}
        <div className="p-3 rounded-lg border border-surface-border bg-surface-cool/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-brand-deep-teal flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-brand-teal" />
              1. Detection Origin
            </span>
            <Badge variant="teal">{finding.detectorType || 'DETECTOR'}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
            <div>
              <span className="text-text-muted block">Detector Engine:</span>
              <span className="font-medium text-text-primary">{finding.detectorName}</span>
            </div>
            <div>
              <span className="text-text-muted block">Severity Tier:</span>
              <span className="font-semibold text-text-primary">{finding.severity}</span>
            </div>
            <div>
              <span className="text-text-muted block">PII Confidence:</span>
              <span className="font-semibold text-text-primary tabular-nums">
                {(finding.confidence * 100).toFixed(1)}%
              </span>
            </div>
            {typeof finding.recognitionConfidence === 'number' && (
              <div>
                <span className="text-text-muted block">OCR/HTR Confidence:</span>
                <span className="font-semibold text-text-primary tabular-nums">
                  {(finding.recognitionConfidence * 100).toFixed(1)}%
                </span>
              </div>
            )}
            <div>
              <span className="text-text-muted block">Source Type:</span>
              <span className="font-medium text-text-primary">
                {finding.provenance?.sourceType || 'NATIVE_TEXT'}
              </span>
            </div>
            <div>
              <span className="text-text-muted block">Location Spans:</span>
              <span className="font-mono text-text-secondary">
                {typeof finding.location?.startOffset === 'number'
                  ? `[${finding.location.startOffset}–${finding.location.endOffset}]`
                  : 'N/A'}
              </span>
            </div>
          </div>

          {finding.evidence && finding.evidence.length > 0 && (
            <div className="pt-1 border-t border-surface-border/60">
              <span className="text-text-muted block text-[10px]">Evidence Signals:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {finding.evidence.map((ev, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 rounded bg-surface-white border border-surface-border text-[10px] text-text-secondary font-mono"
                  >
                    {ev}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pillar 2: Context Interpretation */}
        <div className="p-3 rounded-lg border border-surface-border bg-surface-cool/30 space-y-2">
          <span className="font-semibold text-brand-deep-teal flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-brand-teal" />
            2. Contextual Classification
          </span>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-text-muted block">Category:</span>
              <span className="font-medium text-text-primary">
                {finding.category || 'DIRECT_IDENTIFIER'}
              </span>
            </div>
            <div>
              <span className="text-text-muted block">Block Reference:</span>
              <span className="font-mono text-text-primary truncate block" title={finding.location?.blockId}>
                {finding.location?.blockId || 'default'}
              </span>
            </div>
          </div>
        </div>

        {/* Pillar 3: Policy Decision (What the policy recommends) */}
        <div className="p-3 rounded-lg border border-surface-border bg-surface-cool/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-brand-deep-teal flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-brand-teal" />
              3. Policy Recommendation
            </span>
            {decision ? (
              decision.decision === 'REDACT' ? (
                <Badge variant="critical">REDACT</Badge>
              ) : decision.decision === 'REVIEW' ? (
                <Badge variant="warning">REVIEW</Badge>
              ) : (
                <Badge variant="success">KEEP</Badge>
              )
            ) : (
              <Badge variant="neutral">EVALUATION PENDING</Badge>
            )}
          </div>

          {decision ? (
            <div className="space-y-2 text-[11px] pt-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-text-muted block">Policy ID / Version:</span>
                  <span className="font-medium text-text-primary">
                    {decision.policyId} (v{decision.policyVersion})
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block">Decision Score:</span>
                  <span className="font-semibold text-text-primary tabular-nums">
                    {(decision.decisionScore * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {decision.rationaleCodes && decision.rationaleCodes.length > 0 && (
                <div>
                  <span className="text-text-muted block">Rationale Codes:</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {decision.rationaleCodes.map((rc, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded bg-surface-white border border-surface-border text-[10px] text-text-primary font-mono"
                      >
                        {rc}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {decision.evaluationWarnings && decision.evaluationWarnings.length > 0 && (
                <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    {decision.evaluationWarnings.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-text-secondary italic">
              Policy evaluation has not yet processed this candidate. Run Decision Evaluation to generate recommendations.
            </p>
          )}
        </div>

        {/* Pillar 4: Transformation State (What was actually changed) */}
        <div className="p-3 rounded-lg border border-surface-border bg-surface-cool/30 space-y-2">
          <span className="font-semibold text-brand-deep-teal flex items-center gap-1.5">
            <FileCheck className="w-3.5 h-3.5 text-brand-teal" />
            4. Transformation Status
          </span>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-text-muted block">Physical Redaction:</span>
              <span className="font-medium text-text-primary">
                {finding.isRedacted ? 'Applied (Mutated)' : 'Not Executed'}
              </span>
            </div>
            <div>
              <span className="text-text-muted block">Display Masking:</span>
              <span className="font-medium text-text-primary">
                {finding.isMasked ? 'Masked' : 'Unmasked'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
