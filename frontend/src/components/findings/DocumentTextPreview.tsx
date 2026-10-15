import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { NormalizedDocument, NormalizedDocumentBlock } from '../../types/document';
import { PIICandidateItem } from '../../types/pii';
import { FileText, AlertCircle, Hash } from 'lucide-react';

interface DocumentTextPreviewProps {
  normalizedDoc: NormalizedDocument | null;
  findings: PIICandidateItem[];
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  isLoading?: boolean;
}

export const DocumentTextPreview: React.FC<DocumentTextPreviewProps> = ({
  normalizedDoc,
  findings,
  selectedFindingId,
  onSelectFinding,
  isLoading = false,
}) => {
  // Map findings by blockId for block-level highlight matching
  const findingsByBlock = useMemo(() => {
    const map = new Map<string, PIICandidateItem[]>();
    findings.forEach((f) => {
      const blockId = f.location?.blockId || 'default';
      const existing = map.get(blockId) || [];
      existing.push(f);
      map.set(blockId, existing);
    });
    return map;
  }, [findings]);

  // Render block text with real offset-based spans
  const renderHighlightedBlockText = (block: NormalizedDocumentBlock) => {
    const blockFindings = (findingsByBlock.get(block.blockId) || []).filter(
      (f) =>
        typeof f.location?.startOffset === 'number' &&
        typeof f.location?.endOffset === 'number' &&
        f.location.startOffset >= 0 &&
        f.location.endOffset > f.location.startOffset
    );

    if (blockFindings.length === 0) {
      return <span>{block.text}</span>;
    }

    // Sort findings by start offset ascending
    blockFindings.sort((a, b) => a.location.startOffset - b.location.startOffset);

    const elements: React.ReactNode[] = [];
    let cursor = 0;
    const text = block.text;

    blockFindings.forEach((finding, idx) => {
      // Relative offset within block if offsets are block-relative, or clamp to block length
      const start = Math.max(cursor, Math.min(finding.location.startOffset, text.length));
      const end = Math.max(start, Math.min(finding.location.endOffset, text.length));

      // Append leading unhighlighted text
      if (start > cursor) {
        elements.push(
          <span key={`text-${cursor}-${start}`}>{text.substring(cursor, start)}</span>
        );
      }

      const isSelected = selectedFindingId === finding.candidateId;

      // Color coding based on decision recommendation or severity
      const highlightClass = isSelected
        ? 'bg-brand-teal text-white font-bold ring-2 ring-brand-teal ring-offset-1 rounded px-1 cursor-pointer transition-all'
        : finding.decision === 'REDACT'
          ? 'bg-status-critical-bg text-status-critical border-b-2 border-status-critical font-medium px-1 rounded hover:bg-red-200 cursor-pointer transition-colors'
          : finding.decision === 'REVIEW'
            ? 'bg-status-warning-bg text-status-warning border-b-2 border-status-warning font-medium px-1 rounded hover:bg-amber-200 cursor-pointer transition-colors'
            : 'bg-brand-pale-teal text-brand-deep-teal border-b-2 border-brand-teal font-medium px-1 rounded hover:bg-teal-200 cursor-pointer transition-colors';

      elements.push(
        <button
          key={`finding-${finding.candidateId}-${idx}`}
          type="button"
          onClick={() => onSelectFinding(finding.candidateId)}
          className={highlightClass}
          title={`[${finding.type}] Confidence: ${(finding.confidence * 100).toFixed(1)}% | Decision: ${finding.decision || 'PENDING'}`}
        >
          {text.substring(start, end) || `[${finding.type}]`}
        </button>
      );

      cursor = end;
    });

    // Append trailing unhighlighted text
    if (cursor < text.length) {
      elements.push(<span key={`text-tail-${cursor}`}>{text.substring(cursor)}</span>);
    }

    return elements;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="h-4 bg-slate-200 rounded w-full"></div>
            <div className="h-4 bg-slate-200 rounded w-5/6"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!normalizedDoc || !normalizedDoc.blocks || normalizedDoc.blocks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Extracted Document Preview</CardTitle>
          <CardDescription>
            Normalized text stream with live finding overlay.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-6 text-center border-2 border-dashed border-surface-border rounded-lg bg-surface-cool/40">
            <AlertCircle className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-sm font-semibold text-text-primary">
              No normalized text content available
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Document extraction has not been performed, or the document contains no extractable text blocks.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 border-b border-surface-border">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-teal" />
              Document Text Stream
            </CardTitle>
            <CardDescription>
              {normalizedDoc.blocks.length} blocks extracted | {findings.length} findings located
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-status-critical border border-status-critical"></span>
              REDACT
            </span>
            <span className="flex items-center gap-1 ml-2">
              <span className="w-2.5 h-2.5 rounded bg-status-warning border border-status-warning"></span>
              REVIEW
            </span>
            <span className="flex items-center gap-1 ml-2">
              <span className="w-2.5 h-2.5 rounded bg-brand-teal border border-brand-teal"></span>
              KEEP / PASS
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 flex-1 overflow-y-auto max-h-[600px] space-y-4 font-mono text-xs leading-relaxed bg-surface-white">
        {normalizedDoc.blocks.map((block, idx) => (
          <div
            key={block.blockId || `blk-${idx}`}
            className="p-3 rounded border border-surface-border bg-surface-cool/30 relative hover:border-slate-300 transition-colors"
          >
            <div className="flex items-center justify-between text-[10px] text-text-muted font-sans pb-1.5 mb-1.5 border-b border-surface-border/60">
              <span className="flex items-center gap-1 font-semibold text-text-secondary">
                <Hash className="w-3 h-3 text-text-muted" />
                Block {idx + 1} ({block.type || 'TEXT'})
              </span>
              <div className="flex items-center gap-2">
                {typeof block.pageNumber === 'number' && (
                  <span>Page {block.pageNumber}</span>
                )}
                <span>Offsets {block.startOffset}–{block.endOffset}</span>
              </div>
            </div>

            <div className="text-text-primary whitespace-pre-wrap select-text">
              {renderHighlightedBlockText(block)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
