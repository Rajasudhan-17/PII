import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  RotateCw,
  Search,
  Check,
  FileText,
  Crosshair,
} from 'lucide-react';
import { useRedact, DEFAULT_OFFER_LETTER_TEXT, FindingItem } from '../context/RedactContext';

export const ReviewWorkspacePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    documents,
    findings,
    previewMode,
    setPreviewMode,
    currentLook,
    setCurrentLook,
    redactFinding,
    keepFinding,
    undoDecision,
    toggleFindingStatus,
    addManualRedaction,
    canUndo,
    canRedo,
    undo,
    redo,
    applyAndVerify,
  } = useRedact();

  const docId = id || 'offer_letter.docx';
  const currentDoc = documents[docId] || documents['offer_letter.docx'];
  const docText = currentDoc?.originalText || DEFAULT_OFFER_LETTER_TEXT;

  // Search & Filter state in sidebar
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'review' | 'redact' | 'keep'>('all');

  // Manual text selection state
  const [selectedText, setSelectedText] = useState('');
  const [selectionCoords, setSelectionCoords] = useState<{ x: number; y: number } | null>(null);
  const docContainerRef = useRef<HTMLDivElement>(null);

  // Calculate live counts
  const reviewItems = useMemo(() => findings.filter((f) => f.status === 'review'), [findings]);
  const redactItems = useMemo(() => findings.filter((f) => f.status === 'redact'), [findings]);
  const keptItems = useMemo(() => findings.filter((f) => f.status === 'keep'), [findings]);

  const totalFindings = findings.length;
  const reviewCount = reviewItems.reduce((acc, f) => acc + f.places, 0);
  const redactCount = redactItems.reduce((acc, f) => acc + f.places, 0);
  const keptCount = keptItems.reduce((acc, f) => acc + f.places, 0);

  // Search filtered items
  const filteredReviewItems = useMemo(
    () =>
      findings.filter(
        (f) =>
          f.status === 'review' &&
          (!searchQuery ||
            f.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.label.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [findings, searchQuery]
  );

  const filteredRedactItems = useMemo(
    () =>
      findings.filter(
        (f) =>
          f.status === 'redact' &&
          (!searchQuery ||
            f.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.label.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [findings, searchQuery]
  );

  const filteredKeptItems = useMemo(
    () =>
      findings.filter(
        (f) =>
          f.status === 'keep' &&
          (!searchQuery ||
            f.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.label.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [findings, searchQuery]
  );

  // Handle text selection in document preview
  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectedText('');
        setSelectionCoords(null);
        return;
      }
      const text = selection.toString().trim();
      if (text.length > 1) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelectedText(text);
        setSelectionCoords({
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        });
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleApplyAndVerify = () => {
    applyAndVerify(docId);
    navigate(`/verify/${docId}`);
  };

  // Helper to render redaction token based on current look
  const renderRedactionToken = (val: string, label: string) => {
    if (previewMode === 'original') {
      return <span className="font-medium text-[#111827]">{val}</span>;
    }

    if (currentLook === 'label') {
      return (
        <span className="font-mono text-[10px] font-bold bg-[#111827] text-white px-1.5 py-0.5 rounded tracking-wider">
          [{label || 'REDACTED'}]
        </span>
      );
    }

    if (currentLook === 'partial') {
      const clean = val.replace(/\s+/g, '');
      const lastDigits = clean.slice(-4) || '••••';
      return (
        <span className="font-mono text-xs font-semibold text-[#111827] bg-[#F3F4F6] px-1.5 py-0.5 rounded border border-[#E5E7EB]">
          •••• {lastDigits}
        </span>
      );
    }

    // Default: Black bar
    return (
      <span
        title={val}
        className="inline-block bg-[#111827] rounded-[2px] h-4 align-middle px-1 text-transparent select-none cursor-pointer"
      >
        {'█'.repeat(Math.max(val.length, 6))}
      </span>
    );
  };

  // Helper to render a paragraph with dynamic inline findings
  const renderParagraph = (line: string, lineIndex: number) => {
    if (!line.trim()) {
      return <div key={lineIndex} className="h-4" />;
    }

    // Collect all matches of findings in this line
    interface SpanMatch {
      start: number;
      end: number;
      finding: FindingItem;
    }

    const matches: SpanMatch[] = [];
    for (const f of findings) {
      if (!f.value || f.value.length === 0) continue;
      let startIdx = 0;
      while ((startIdx = line.indexOf(f.value, startIdx)) !== -1) {
        matches.push({
          start: startIdx,
          end: startIdx + f.value.length,
          finding: f,
        });
        startIdx += f.value.length;
      }
    }

    // Sort matches by start position, then length descending
    matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    // Remove overlapping matches
    const nonOverlapping: SpanMatch[] = [];
    let lastEnd = 0;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        nonOverlapping.push(m);
        lastEnd = m.end;
      }
    }

    if (nonOverlapping.length === 0) {
      return (
        <p key={lineIndex} className="mb-3 leading-relaxed">
          {line}
        </p>
      );
    }

    const elements: React.ReactNode[] = [];
    let curIdx = 0;
    for (let i = 0; i < nonOverlapping.length; i++) {
      const m = nonOverlapping[i];
      if (m.start > curIdx) {
        elements.push(line.substring(curIdx, m.start));
      }

      const f = m.finding;
      if (previewMode === 'original') {
        elements.push(
          <span key={`${lineIndex}_${i}`} className="font-medium text-[#111827]">
            {f.value}
          </span>
        );
      } else if (f.status === 'review') {
        elements.push(
          <span
            key={`${lineIndex}_${i}`}
            className="bg-[#FEF08A] border border-[#FACC15] text-[#854D0E] font-semibold px-1 py-0.5 rounded inline-flex items-center gap-1 group relative cursor-pointer shadow-xs mx-0.5"
            title={`${f.label} (${f.confidence || 60}% sure) — Click to toggle`}
            onClick={() => toggleFindingStatus(f.id)}
          >
            <span>{f.value}</span>
            <span className="bg-[#111827] text-white font-mono text-[9px] font-bold px-1 py-0.2 rounded uppercase tracking-wider">
              {f.label} · {f.confidence || 60}%
            </span>
          </span>
        );
      } else if (f.status === 'redact') {
        elements.push(
          <span
            key={`${lineIndex}_${i}`}
            className="mx-0.5 inline-block"
            onClick={() => keepFinding(f.id)}
            title="Redacted (Click to Keep)"
          >
            {renderRedactionToken(f.value, f.label)}
          </span>
        );
      } else {
        // kept
        elements.push(
          <span
            key={`${lineIndex}_${i}`}
            className="underline decoration-dotted decoration-[#9CA3AF] text-[#111827] font-medium mx-0.5 cursor-pointer"
            title="Kept on purpose (Click to Redact)"
            onClick={() => redactFinding(f.id)}
          >
            {f.value}
          </span>
        );
      }
      curIdx = m.end;
    }

    if (curIdx < line.length) {
      elements.push(line.substring(curIdx));
    }

    return (
      <p key={lineIndex} className="mb-3 leading-relaxed">
        {elements}
      </p>
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-[#F3F4F6]">
      {/* Sub-header Bar */}
      <div className="bg-white border-b border-[#E5E7EB] px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-16 z-20 shadow-subtle">
        {/* Left Stats & Document Info */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1 text-xs text-[#4B5563] hover:text-[#111827] font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Upload</span>
          </Link>

          <div className="h-4 w-[1px] bg-[#E5E7EB]" />

          <div className="flex items-center gap-1.5 font-bold text-xs text-[#111827]">
            <FileText className="w-3.5 h-3.5 text-[#6B7280]" />
            <span>{docId}</span>
          </div>

          <span className="bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[10px] font-bold px-2 py-0.5 rounded-full">
            Reviewing
          </span>

          {/* Metric Badges */}
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="bg-[#F3F4F6] text-[#4B5563] font-bold px-2 py-0.5 rounded-full">
              {totalFindings} findings
            </span>
            <span className="bg-[#111827] text-white font-bold px-2 py-0.5 rounded-full">
              {redactCount} redact
            </span>
            {reviewCount > 0 && (
              <span className="bg-[#FEF3C7] text-[#92400E] font-bold px-2 py-0.5 rounded-full">
                {reviewCount} need review
              </span>
            )}
            {keptCount > 0 && (
              <span className="border border-[#E5E7EB] bg-white text-[#4B5563] font-semibold px-2 py-0.5 rounded-full">
                {keptCount} kept
              </span>
            )}
          </div>
        </div>

        {/* Right Controls: Undo/Redo + Preview Toggle + Look Style + CTA */}
        <div className="flex items-center gap-3">
          {/* Undo / Redo */}
          <div className="flex items-center gap-1 border border-[#E5E7EB] rounded-lg p-0.5 bg-white">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title="Undo decision"
              className="p-1 rounded text-[#4B5563] hover:text-[#111827] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              title="Redo decision"
              className="p-1 rounded text-[#4B5563] hover:text-[#111827] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Preview Toggle Pill: Original vs Redacted */}
          <div className="flex items-center bg-[#F3F4F6] p-0.5 rounded-lg border border-[#E5E7EB] text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPreviewMode('original')}
              className={`px-3 py-1 rounded-md transition-all ${
                previewMode === 'original'
                  ? 'bg-white text-[#111827] shadow-xs font-bold'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('redacted')}
              className={`px-3 py-1 rounded-md transition-all ${
                previewMode === 'redacted'
                  ? 'bg-[#111827] text-white shadow-xs font-bold'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Redacted preview
            </button>
          </div>

          {/* Redaction Look Picker */}
          <div className="flex items-center bg-[#F3F4F6] p-0.5 rounded-lg border border-[#E5E7EB] text-xs">
            <button
              type="button"
              onClick={() => setCurrentLook('bar')}
              title="Black bar redaction look"
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                currentLook === 'bar'
                  ? 'bg-white text-[#111827] shadow-xs'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Bar
            </button>
            <button
              type="button"
              onClick={() => setCurrentLook('label')}
              title="Label redaction look [TYPE]"
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                currentLook === 'label'
                  ? 'bg-white text-[#111827] shadow-xs'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Label
            </button>
            <button
              type="button"
              onClick={() => setCurrentLook('partial')}
              title="Partial mask redaction look •••• 1234"
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                currentLook === 'partial'
                  ? 'bg-white text-[#111827] shadow-xs'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Partial
            </button>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={handleApplyAndVerify}
            className="bg-[#111827] hover:bg-black text-white text-xs font-bold py-1.5 px-4 rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
          >
            <span>Apply & verify</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 items-start max-w-7xl mx-auto w-full">
        {/* Left Column: Realistic Document Preview Sheet */}
        <div className="lg:col-span-8 flex justify-center">
          <div
            ref={docContainerRef}
            className="w-full max-w-2xl bg-white rounded-xl border border-[#E5E7EB] shadow-card p-10 sm:p-14 text-sm text-[#111827] leading-relaxed relative select-text"
          >
            {/* Document Dynamic Text Rendering */}
            {docText.split('\n').map((line, idx) => renderParagraph(line, idx))}
          </div>
        </div>

        {/* Floating Manual Redaction Action Tooltip */}
        {selectedText && selectionCoords && (
          <div
            style={{
              position: 'fixed',
              left: `${selectionCoords.x}px`,
              top: `${selectionCoords.y - 40}px`,
              transform: 'translateX(-50%)',
            }}
            className="z-50 bg-[#111827] text-white p-1 rounded-lg shadow-dropdown flex items-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => {
                addManualRedaction(selectedText);
                setSelectedText('');
                setSelectionCoords(null);
              }}
              className="text-[11px] font-bold px-2.5 py-1 bg-[#FACC15] text-[#111827] rounded hover:bg-[#FDE047] transition-colors"
            >
              Redact "{selectedText.slice(0, 15)}..."
            </button>
          </div>
        )}

        {/* Right Column: Findings Sidebar */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#F3F4F6]">
            <h2 className="text-sm font-bold text-[#111827]">Findings</h2>
            <span className="text-[11px] text-[#6B7280] font-medium">{totalFindings} total</span>
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by value or type"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#E5E7EB] focus:outline-none focus:border-[#111827] bg-[#F9FAFB]"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 text-xs pb-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                activeTab === 'all'
                  ? 'bg-[#111827] text-white'
                  : 'bg-[#F3F4F6] text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              All {totalFindings}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('review')}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                activeTab === 'review'
                  ? 'bg-[#111827] text-white'
                  : 'bg-[#F3F4F6] text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              Review {reviewCount}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('redact')}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                activeTab === 'redact'
                  ? 'bg-[#111827] text-white'
                  : 'bg-[#F3F4F6] text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              Redact {redactCount}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('keep')}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                activeTab === 'keep'
                  ? 'bg-[#111827] text-white'
                  : 'bg-[#F3F4F6] text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              Keep {keptCount}
            </button>
          </div>

          {/* Group 1: Needs Review */}
          {filteredReviewItems.length > 0 && (activeTab === 'all' || activeTab === 'review') && (
            <div className="space-y-2 pt-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#92400E] bg-[#FEF3C7] px-2 py-1 rounded flex items-center justify-between">
                <span>NEEDS REVIEW · {filteredReviewItems.length} ITEMS</span>
              </div>

              {filteredReviewItems.map((f) => (
                <div
                  key={f.id}
                  className="p-3.5 rounded-xl border border-[#FDE68A] bg-[#FEFCE8] space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold bg-[#111827] text-white text-[9px] px-1 py-0.5 rounded">
                        {f.label}
                      </span>
                      <span className="text-[#6B7280]">{f.sureText || `${f.confidence}% sure`}</span>
                    </div>
                    <span className="text-[#6B7280] text-[10px]">{f.places} places</span>
                  </div>

                  <p className="text-xs font-bold text-[#111827]">{f.value}</p>
                  {f.reason && (
                    <p className="text-[11px] text-[#6B7280] leading-snug">{f.reason}</p>
                  )}

                  {/* Actions: Redact or Keep */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => redactFinding(f.id)}
                      className="flex-1 bg-[#111827] hover:bg-black text-white text-xs font-semibold py-1.5 px-3 rounded-lg shadow-sm transition-colors"
                    >
                      Redact
                    </button>
                    <button
                      type="button"
                      onClick={() => keepFinding(f.id)}
                      className="flex-1 bg-white hover:bg-slate-50 border border-[#D1D5DB] text-[#111827] text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors"
                    >
                      Keep
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Group 2: Will Redact */}
          {filteredRedactItems.length > 0 && (activeTab === 'all' || activeTab === 'redact') && (
            <div className="space-y-1.5 pt-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#4B5563] px-1 pb-1">
                WILL REDACT · {filteredRedactItems.length} PLACES
              </div>

              {filteredRedactItems.map((f) => (
                <div
                  key={f.id}
                  onClick={() => toggleFindingStatus(f.id)}
                  className="p-2.5 rounded-lg border border-[#E5E7EB] hover:border-[#D1D5DB] bg-white flex items-center justify-between gap-2 cursor-pointer group transition-all"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-[9px] font-bold bg-[#F3F4F6] text-[#4B5563] px-1.5 py-0.5 rounded shrink-0">
                      {f.label}
                    </span>
                    <span className="text-xs font-medium text-[#111827] truncate">
                      {f.value}
                    </span>
                    {f.places > 1 && (
                      <span className="text-[10px] text-[#6B7280] font-mono">×{f.places}</span>
                    )}
                  </div>

                  <div className="w-5 h-5 rounded-full bg-[#111827] text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Group 3: Kept on Purpose */}
          {filteredKeptItems.length > 0 && (activeTab === 'all' || activeTab === 'keep') && (
            <div className="space-y-1.5 pt-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#4B5563] px-1 pb-1">
                KEPT · {filteredKeptItems.length} PLACE{filteredKeptItems.length > 1 ? 'S' : ''}
              </div>

              {filteredKeptItems.map((f) => (
                <div
                  key={f.id}
                  className="p-2.5 rounded-lg border border-[#E5E7EB] bg-white flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-[9px] font-bold bg-[#F3F4F6] text-[#4B5563] px-1.5 py-0.5 rounded shrink-0">
                      {f.label}
                    </span>
                    <span className="text-xs font-medium text-[#111827] truncate">
                      {f.value}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => undoDecision(f.id)}
                    className="text-[11px] font-bold text-[#111827] hover:underline"
                  >
                    Undo
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Tooltip Hint */}
          <div className="pt-3 border-t border-[#F3F4F6] flex items-start gap-2 text-[11px] text-[#6B7280]">
            <Crosshair className="w-4 h-4 text-[#9CA3AF] shrink-0 mt-0.5" />
            <span>Missed something? Select text in the document to redact it by hand.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
