import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Lock, ArrowRight, Check } from 'lucide-react';
import { useRedact } from '../context/RedactContext';

interface StagedFileItem {
  id: string;
  name: string;
  ext: string;
  size: string;
  progress?: number;
  findingsCount?: number;
  readyForReview: boolean;
  rawFile?: File;
}

export const NewRedactionPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    ruleSets,
    activeRuleSetId,
    setActiveRuleSetId,
    currentLook,
    setCurrentLook,
    scanUploadedFile,
    setCurrentDocumentId,
  } = useRedact();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanPhaseText, setScanPhaseText] = useState('Scanning for personal data...');

  // Files in upload staging
  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([
    {
      id: 'offer_letter.docx',
      name: 'offer_letter.docx',
      ext: 'DOCX',
      size: '38 KB',
      progress: 100,
      findingsCount: 13,
      readyForReview: true,
    },
    {
      id: 'patients_q3.csv',
      name: 'patients_q3.csv',
      ext: 'CSV',
      size: '112 KB',
      findingsCount: 148,
      readyForReview: true,
    },
  ]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: StagedFileItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.name.split('.').pop()?.toUpperCase() || 'FILE';
      added.push({
        id: f.name,
        name: f.name,
        ext,
        size: `${Math.max(1, Math.round(f.size / 1024))} KB`,
        progress: 0,
        readyForReview: false,
        rawFile: f,
      });
    }
    setStagedFiles((prev) => [...prev, ...added]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleScanClick = async () => {
    setIsScanning(true);
    setScanProgress(15);
    setScanPhaseText('Reading file structure...');

    // Find the first unreviewed file with a rawFile, or the last added file
    const targetItem = stagedFiles.find((f) => f.rawFile) || stagedFiles[0];

    try {
      if (targetItem.rawFile) {
        setTimeout(() => {
          setScanProgress(45);
          setScanPhaseText('Running 11 PII detectors...');
        }, 200);

        setTimeout(() => {
          setScanProgress(80);
          setScanPhaseText('Applying rule set filters...');
        }, 500);

        const docId = await scanUploadedFile(targetItem.rawFile);

        setTimeout(() => {
          setScanProgress(100);
          setScanPhaseText('Scan complete!');
          setIsScanning(false);
          setCurrentDocumentId(docId);
          navigate(`/review/${docId}`);
        }, 800);
      } else {
        // Default demo document fallback
        let p = 20;
        const interval = setInterval(() => {
          p += 25;
          if (p >= 100) {
            clearInterval(interval);
            setScanProgress(100);
            setIsScanning(false);
            setCurrentDocumentId('offer_letter.docx');
            navigate('/review/offer_letter.docx');
          } else {
            setScanProgress(p);
          }
        }, 150);
      }
    } catch (err) {
      console.error('Scan error:', err);
      setIsScanning(false);
      navigate(`/review/${targetItem.id}`);
    }
  };

  const handleOpenReview = (docId: string) => {
    setCurrentDocumentId(docId);
    navigate(`/review/${docId}`);
  };

  const handleClearAll = () => {
    setStagedFiles([]);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Step Badge */}
      <div className="mb-3">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FEF08A] text-[#854D0E] border border-[#FDE047]">
          STEP 1 OF 3 • UPLOAD
        </span>
      </div>

      {/* Hero Heading */}
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111827] leading-tight mb-3">
        Find it.{' '}
        <span className="bg-[#111827] text-white px-3 py-0.5 rounded-xl inline-block shadow-sm">
          Black it out.
        </span>{' '}
        Prove it's gone.
      </h1>

      <p className="text-sm text-[#4B5563] max-w-2xl mb-8 leading-relaxed">
        Drop in a document, review what we found, and download a clean copy. Nothing is changed
        until you approve it.
      </p>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Dropzone & File Queue */}
        <div className="lg:col-span-7 space-y-6">
          {/* Dropzone Container */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-[#111827] bg-[#FEF9C3]/50 scale-[1.01]'
                : 'border-[#D1D5DB] hover:border-[#111827] bg-[#FAFAFA]'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
              multiple
              accept=".docx,.txt,.csv,.pdf,.json,.md"
            />

            <div className="w-14 h-14 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center mx-auto mb-4 shadow-sm text-[#111827]">
              <Upload className="w-6 h-6 stroke-[2.2]" />
            </div>

            <p className="text-base font-bold text-[#111827] mb-1">
              Drop files here, or{' '}
              <span className="underline decoration-2 underline-offset-2 hover:text-black">
                browse
              </span>
            </p>
            <p className="text-xs text-[#6B7280]">
              Word (.docx), spreadsheets (.csv), plain text (.txt), and PDF
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-[#E5E7EB] text-[#374151]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                DOCX (In place)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-[#E5E7EB] text-[#374151]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                TXT (Exact)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-[#E5E7EB] text-[#374151]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                CSV (Cell-level)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-[#E5E7EB] text-[#374151]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                PDF (Under review)
              </span>
            </div>
          </div>

          {/* Staged Files Queue */}
          {stagedFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="font-bold text-[#111827]">
                  Ready to scan · {stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs text-[#6B7280] hover:text-[#111827] font-medium transition-colors"
                >
                  Clear all
                </button>
              </div>

              {stagedFiles.map((f) => (
                <div
                  key={f.id}
                  className="p-4 bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#F3F4F6] text-[#4B5563] text-[10px] font-extrabold flex items-center justify-center shrink-0 border border-[#E5E7EB]">
                      {f.ext}
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-bold text-[#111827] truncate">
                        {f.name}
                      </p>
                      <p className="text-[11px] text-[#6B7280]">{f.size}</p>
                    </div>
                  </div>

                  {/* Status / Action */}
                  <div className="shrink-0 flex items-center gap-3">
                    {f.readyForReview && !isScanning ? (
                      <>
                        {f.findingsCount !== undefined && (
                          <span className="bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                            {f.findingsCount} findings
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenReview(f.id)}
                          className="border border-[#D1D5DB] hover:bg-slate-50 text-xs font-semibold px-4 py-1.5 rounded-lg text-[#111827] transition-colors"
                        >
                          Review
                        </button>
                      </>
                    ) : isScanning ? (
                      <div className="w-48 text-right">
                        <div className="flex items-center justify-between text-[11px] text-[#6B7280] mb-1">
                          <span>{scanPhaseText}</span>
                          <span className="font-bold text-[#111827]">{scanProgress}%</span>
                        </div>
                        <div className="w-full bg-[#E5E7EB] rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-[#111827] h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${scanProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="bg-[#F3F4F6] text-[#6B7280] text-[11px] font-semibold px-3 py-1 rounded-full">
                        Ready to scan
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Rule Set & Look Configuration */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm space-y-6">
          {/* Rule Set Selection */}
          <div>
            <h2 className="text-sm font-bold text-[#111827] mb-0.5">
              What should we look for?
            </h2>
            <p className="text-[11px] text-[#6B7280] mb-3">
              Pick a rule set. Fine-tune it any time under Rules.
            </p>

            <div className="space-y-2">
              {ruleSets.slice(0, 5).map((rs) => {
                const isSelected = rs.id === activeRuleSetId;
                return (
                  <div
                    key={rs.id}
                    onClick={() => setActiveRuleSetId(rs.id)}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#111827] bg-[#FEF9C3]/40 shadow-sm'
                        : 'border-[#E5E7EB] hover:border-[#D1D5DB] bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-[#111827] flex items-center gap-1.5">
                          {rs.name}
                        </p>
                        <p className="text-[11px] text-[#6B7280] leading-snug">
                          {rs.description || rs.typeSummary}
                        </p>
                      </div>

                      {/* Radio Circle */}
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          isSelected
                            ? 'border-[#111827] bg-[#111827] text-white'
                            : 'border-[#9CA3AF] bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Look Style Selection */}
          <div>
            <h2 className="text-xs font-bold text-[#111827] mb-2">
              How should it look?
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {/* Option 1: Black bar */}
              <button
                type="button"
                onClick={() => setCurrentLook('bar')}
                className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                  currentLook === 'bar'
                    ? 'border-[#111827] bg-[#F9FAFB] shadow-sm'
                    : 'border-[#E5E7EB] hover:border-[#D1D5DB] bg-white'
                }`}
              >
                <div className="w-8 h-3.5 bg-[#111827] rounded-[2px]" />
                <span className="text-[11px] font-semibold text-[#111827]">
                  Black bar
                </span>
              </button>

              {/* Option 2: Label */}
              <button
                type="button"
                onClick={() => setCurrentLook('label')}
                className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                  currentLook === 'label'
                    ? 'border-[#111827] bg-[#F9FAFB] shadow-sm'
                    : 'border-[#E5E7EB] hover:border-[#D1D5DB] bg-white'
                }`}
              >
                <span className="font-mono text-[10px] text-[#4B5563] bg-[#F3F4F6] px-1 py-0.5 rounded">
                  [PHONE]
                </span>
                <span className="text-[11px] font-semibold text-[#111827]">
                  Label
                </span>
              </button>

              {/* Option 3: Partial */}
              <button
                type="button"
                onClick={() => setCurrentLook('partial')}
                className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                  currentLook === 'partial'
                    ? 'border-[#111827] bg-[#F9FAFB] shadow-sm'
                    : 'border-[#E5E7EB] hover:border-[#D1D5DB] bg-white'
                }`}
              >
                <span className="font-mono text-[10px] text-[#4B5563]">
                  •••• 3210
                </span>
                <span className="text-[11px] font-semibold text-[#111827]">
                  Partial
                </span>
              </button>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2">
            <button
              type="button"
              disabled={isScanning || stagedFiles.length === 0}
              onClick={handleScanClick}
              className="w-full bg-[#111827] hover:bg-black disabled:bg-slate-300 text-white text-xs font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <span>{isScanning ? scanPhaseText : `Scan ${stagedFiles.length} file${stagedFiles.length > 1 ? 's' : ''}`}</span>
              {!isScanning && <ArrowRight className="w-3.5 h-3.5" />}
            </button>

            <div className="flex items-center justify-center gap-1 text-[11px] text-[#6B7280] mt-3">
              <Lock className="w-3 h-3 text-[#9CA3AF]" />
              <span>Your original file is never modified.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
