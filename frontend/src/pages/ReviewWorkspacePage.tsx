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
import { useRedact } from '../context/RedactContext';

export const ReviewWorkspacePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
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
  const renderRedactionToken = (val: string, label: string, customWidth = 'w-28') => {
    if (previewMode === 'original') {
      return <span className="font-medium text-[#111827]">{val}</span>;
    }

    if (currentLook === 'label') {
      return (
        <span className="font-mono text-[10px] font-bold bg-[#111827] text-white px-1.5 py-0.5 rounded tracking-wider">
          [{label}]
        </span>
      );
    }

    if (currentLook === 'partial') {
      const lastDigits = val.slice(-4) || '3210';
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
        className={`inline-block bg-[#111827] rounded-[2px] h-4 align-middle ${customWidth}`}
      />
    );
  };

  // Finding status check for interactive rendering in document text
  const isNorthwindRedacted = findings.find((f) => f.id === 'finding_northwind')?.status === 'redact';
  const isArunRedacted = findings.find((f) => f.id === 'finding_arun')?.status === 'redact';

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

          {/* Original vs Redacted Preview Toggle */}
          <div className="flex items-center bg-[#F3F4F6] p-0.5 rounded-lg border border-[#E5E7EB] text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPreviewMode('original')}
              className={`px-3 py-1 rounded-md transition-all ${
                previewMode === 'original'
                  ? 'bg-white text-[#111827] shadow-sm'
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
                  ? 'bg-white text-[#111827] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Redacted preview
            </button>
          </div>

          {/* Look Switcher Pills */}
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setCurrentLook('bar')}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${
                currentLook === 'bar'
                  ? 'border-[#111827] bg-[#111827] text-white shadow-sm'
                  : 'border-[#E5E7EB] bg-white text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              Bar
            </button>
            <button
              type="button"
              onClick={() => setCurrentLook('label')}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${
                currentLook === 'label'
                  ? 'border-[#111827] bg-[#111827] text-white shadow-sm'
                  : 'border-[#E5E7EB] bg-white text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              [LABEL]
            </button>
            <button
              type="button"
              onClick={() => setCurrentLook('partial')}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${
                currentLook === 'partial'
                  ? 'border-[#111827] bg-[#111827] text-white shadow-sm'
                  : 'border-[#E5E7EB] bg-white text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              Partial
            </button>
          </div>

          {/* Primary CTA */}
          <button
            type="button"
            onClick={handleApplyAndVerify}
            className="bg-[#111827] hover:bg-black text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
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
            {/* Top Floating Badge for review item: Northwind Traders */}
            {!isNorthwindRedacted && previewMode === 'redacted' && (
              <div className="mb-2 inline-flex items-center">
                <span className="bg-[#111827] text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                  NAME · 55%
                </span>
              </div>
            )}

            {/* Document Header */}
            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight mb-2">
                Employment Offer Letter
              </h1>
              <p className="text-xs text-[#6B7280]">12 October 2026</p>
            </div>

            {/* Salutation */}
            <p className="mb-4">
              Dear{' '}
              {renderRedactionToken('Priya Nair', 'NAME', 'w-24')}
              ,
            </p>

            {/* Opening Paragraph */}
            <p className="mb-6 leading-relaxed">
              We are pleased to offer you the role of Data Analyst at{' '}
              {isNorthwindRedacted ? (
                renderRedactionToken('Northwind Traders', 'NAME', 'w-36')
              ) : (
                <span className="bg-[#FEF08A] border border-[#FACC15] text-[#854D0E] font-semibold px-1 rounded">
                  Northwind Traders
                </span>
              )}
              , starting 3 November 2026. Please confirm your acceptance by replying to{' '}
              <span className="underline decoration-dotted text-[#111827]">
                hr@northwind.example
              </span>
              .
            </p>

            {/* Details Section */}
            <div className="my-6 pt-4 border-t border-[#F3F4F6]">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-4">
                YOUR DETAILS ON FILE
              </h2>

              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center">
                  <span className="w-36 text-[#6B7280] font-sans">Name</span>
                  <div>{renderRedactionToken('Priya Nair', 'NAME', 'w-24')}</div>
                </div>

                <div className="flex items-center">
                  <span className="w-36 text-[#6B7280] font-sans">Date of birth</span>
                  <div>{renderRedactionToken('14/03/1989', 'BIRTH', 'w-28')}</div>
                </div>

                <div className="flex items-center">
                  <span className="w-36 text-[#6B7280] font-sans">Email</span>
                  <div>{renderRedactionToken('priya.nair@mailbox.example', 'EMAIL', 'w-64')}</div>
                </div>

                <div className="flex items-center">
                  <span className="w-36 text-[#6B7280] font-sans">Phone</span>
                  <div>{renderRedactionToken('+91 98765 43210', 'PHONE', 'w-40')}</div>
                </div>

                <div className="flex items-center">
                  <span className="w-36 text-[#6B7280] font-sans">PAN</span>
                  <div>{renderRedactionToken('ABCDE1234F', 'PAN', 'w-32')}</div>
                </div>

                <div className="flex items-center">
                  <span className="w-36 text-[#6B7280] font-sans">Aadhaar</span>
                  <div>{renderRedactionToken('2345 6789 0124', 'AADHAAR', 'w-36')}</div>
                </div>

                <div className="flex items-center">
                  <span className="w-36 text-[#6B7280] font-sans">Address</span>
                  <div>{renderRedactionToken('42 Lakeview Road, Chennai', 'ADDRESS', 'w-64')}</div>
                </div>

                <div className="flex items-center">
                  <span className="w-36 text-[#6B7280] font-sans">Expense card</span>
                  <div>{renderRedactionToken('4532 0151 1283 0366', 'CARD', 'w-48')}</div>
                </div>
              </div>
            </div>

            {/* Closing */}
            <div className="mt-8 pt-4 border-t border-[#F3F4F6]">
              <p className="mb-4">We look forward to welcoming you to the team.</p>
              <p className="mb-1 text-xs text-[#6B7280]">Sincerely,</p>
              <div className="mb-1">
                {isArunRedacted ? (
                  renderRedactionToken('Arun Mehta', 'NAME', 'w-28')
                ) : (
                  <span className="bg-[#FEF08A] border border-[#FACC15] text-[#854D0E] font-semibold px-1 rounded inline-block">
                    Arun Mehta
                  </span>
                )}
              </div>
              <p className="text-xs text-[#4B5563]">
                Head of People{' '}
                {isNorthwindRedacted ? (
                  renderRedactionToken('Northwind Traders', 'NAME', 'w-32')
                ) : (
                  <span className="bg-[#FEF08A] border border-[#FACC15] text-[#854D0E] font-semibold px-1 rounded inline-block">
                    Northwind Traders
                  </span>
                )}
              </p>
            </div>
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
