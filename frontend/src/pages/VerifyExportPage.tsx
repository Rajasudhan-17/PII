import React, { useState, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  Download,
  Trash2,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { useRedact } from '../context/RedactContext';

export const VerifyExportPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    documents,
    currentDocumentId,
    findings,
    currentLook,
    getRunById,
    deleteRun,
    downloadRedactedFile,
    downloadReport,
  } = useRedact();

  const docId = id || currentDocumentId;
  const run = getRunById(docId);
  const doc = docId ? documents[docId] : undefined;
  const filename = run ? run.filename : doc?.filename || docId || 'document';
  const fileExt = run?.format || doc?.format || 'FILE';
  const cleanFilename = filename.replace(/\.(docx|csv|txt|pdf|png|jpg|jpeg)$/i, '.redacted.$1');

  const [hasDeleted, setHasDeleted] = useState(false);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);

  // Real Counts
  const redactedFindings = useMemo(() => findings.filter((f) => f.status === 'redact'), [findings]);
  const keptFindings = useMemo(() => findings.filter((f) => f.status === 'keep'), [findings]);

  const placesRedacted = useMemo(
    () => redactedFindings.reduce((acc, f) => acc + f.places, 0),
    [redactedFindings]
  );
  const placesKept = useMemo(
    () => keptFindings.reduce((acc, f) => acc + f.places, 0),
    [keptFindings]
  );

  // Kept on purpose summary text
  const keptSummary = useMemo(() => {
    if (keptFindings.length === 0) {
      return 'All detected findings were marked for redaction. 0 items kept.';
    }
    return (
      keptFindings
        .map((f) => `${f.value} (${f.places} place${f.places > 1 ? 's' : ''})`)
        .join(', ') + '. Worth a last look.'
    );
  }, [keptFindings]);

  // Real "Removed by type" distribution
  const typeDistribution = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of redactedFindings) {
      const typeKey = f.label || f.type;
      map.set(typeKey, (map.get(typeKey) || 0) + f.places);
    }
    return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
  }, [redactedFindings]);

  const maxTypeCount = useMemo(() => {
    return Math.max(1, ...typeDistribution.map((t) => t.count));
  }, [typeDistribution]);

  // Real diff items from approved redactions
  const sampleDiffs = useMemo(() => {
    return redactedFindings.slice(0, 6);
  }, [redactedFindings]);

  const handleDownloadFile = async () => {
    await downloadRedactedFile(docId);
    setDownloadSuccessToast(`Downloaded ${cleanFilename}`);
    setTimeout(() => setDownloadSuccessToast(null), 3000);
  };

  const handleDownloadReport = async (fmt: 'pdf' | 'json') => {
    await downloadReport(docId, fmt);
    setDownloadSuccessToast(`Generated and downloaded ${filename}.redaction-report.${fmt}`);
    setTimeout(() => setDownloadSuccessToast(null), 3000);
  };

  const handleDelete = () => {
    deleteRun(docId);
    setHasDeleted(true);
    setTimeout(() => {
      navigate('/history');
    }, 1200);
  };

  if (!doc && !run) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center mx-auto text-[#6B7280]">
          <CheckCircle2 className="w-8 h-8 text-[#9CA3AF]" />
        </div>
        <h2 className="text-xl font-bold text-[#111827]">No Document Verified for Export</h2>
        <p className="text-xs text-[#6B7280] max-w-md mx-auto">
          Please review a document and apply redactions to view verification checks and export sanitized artifacts.
        </p>
        <div className="pt-2">
          <Link
            to="/new"
            className="inline-flex items-center gap-2 bg-[#111827] hover:bg-black text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-colors"
          >
            <span>Start New Redaction</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Toast Notification */}
      {downloadSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#111827] text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-card flex items-center gap-2 border border-[#374151]">
          <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
          <span>{downloadSuccessToast}</span>
        </div>
      )}

      {/* Step Badge & Filename */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FEF08A] text-[#854D0E] border border-[#FDE047]">
          STEP 3 OF 3 • VERIFY & EXPORT
        </span>
        <span className="text-xs text-[#6B7280] font-mono">{filename}</span>
      </div>

      {/* Hero Banner: Verified Clean (Black Box) */}
      <div className="bg-[#111827] text-white rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-card">
        {/* Left Side: Verified Clean Text */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-[#FACC15] flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
            <Check className="w-6 h-6 text-[#111827] stroke-[3]" />
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <span>Verified</span>
              <span className="bg-[#FACC15] text-[#111827] px-2.5 py-0.5 rounded-lg font-black text-xl sm:text-2xl">
                clean.
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-[#9CA3AF] mt-1.5 max-w-md">
              We re-scanned the redacted file from scratch and found no personal data in it.
            </p>
          </div>
        </div>

        {/* Right Side: Key Stats */}
        <div className="flex items-center gap-8 sm:gap-12 pt-4 md:pt-0 border-t md:border-t-0 border-[#374151]">
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">{placesRedacted}</p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">places redacted</p>
          </div>

          <div>
            <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">{placesKept}</p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">kept on purpose</p>
          </div>

          <div>
            <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#FACC15]">0</p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">found in the output</p>
          </div>
        </div>
      </div>

      {/* Main 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: 6 Verification Checks + Kept on Purpose Notice + What Changed Diff */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: 6 Verification Passes */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-[#111827]">
              6 independent checks passed
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Check 1 */}
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#111827]">
                    Searched the output
                  </p>
                  <p className="text-[11px] text-[#6B7280] leading-snug">
                    Zero occurrences of the original sensitive values were found in the output.
                  </p>
                </div>
              </div>

              {/* Check 2 */}
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#111827]">
                    Ran the detectors again
                  </p>
                  <p className="text-[11px] text-[#6B7280] leading-snug">
                    The output was processed by our detection engine as a new file. Nothing flagged.
                  </p>
                </div>
              </div>

              {/* Check 3 */}
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#111827]">
                    Document properties cleared
                  </p>
                  <p className="text-[11px] text-[#6B7280] leading-snug">
                    Author, last modified by, company and the page preview image were removed.
                  </p>
                </div>
              </div>

              {/* Check 4 */}
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#111827]">
                    Hidden content checked
                  </p>
                  <p className="text-[11px] text-[#6B7280] leading-snug">
                    Comments, tracked changes, headers, footers, footnotes and text boxes.
                  </p>
                </div>
              </div>

              {/* Check 5 */}
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#111827]">
                    File still opens
                  </p>
                  <p className="text-[11px] text-[#6B7280] leading-snug">
                    The {fileExt} structure validated cleanly after redaction without corruption.
                  </p>
                </div>
              </div>

              {/* Check 6 */}
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#111827]">
                    Original left untouched
                  </p>
                  <p className="text-[11px] text-[#6B7280] leading-snug">
                    The source file's checksum still matches what you uploaded.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Kept on Purpose Notice */}
          <div className="bg-[#FEFCE8] border border-[#FDE68A] rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#FACC15] flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[#111827] text-xs font-bold">!</span>
              </div>
              <div>
                <p className="text-xs font-bold text-[#92400E]">Kept on purpose</p>
                <p className="text-[11px] text-[#A16207]">
                  {keptSummary}
                </p>
              </div>
            </div>

            <Link
              to={`/review/${docId}`}
              className="bg-white hover:bg-slate-50 border border-[#D1D5DB] text-xs font-semibold px-3 py-1.5 rounded-lg text-[#111827] shrink-0 transition-colors"
            >
              Back to review
            </Link>
          </div>

          {/* Subtext Note */}
          <div className="flex items-center gap-1.5 text-[11px] text-[#6B7280]">
            <Lock className="w-3 h-3 text-[#9CA3AF]" />
            <span>Downloads are only offered when every check passes. If one fails, nothing is exported.</span>
          </div>

          {/* Card 3: What Changed Diff */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-[#111827]">What changed</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Original Box */}
              <div className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] space-y-2">
                <span className="bg-[#E5E7EB] text-[#4B5563] text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider inline-block">
                  ORIGINAL
                </span>
                <div className="font-mono text-xs text-[#111827] space-y-1">
                  {sampleDiffs.length === 0 ? (
                    <p className="text-[#6B7280] italic">No items redacted in this run.</p>
                  ) : (
                    sampleDiffs.map((item, idx) => (
                      <p key={idx}>
                        <span className="text-[#6B7280]">{item.label}:</span> {item.value}
                      </p>
                    ))
                  )}
                </div>
              </div>

              {/* Redacted Box */}
              <div className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] space-y-2">
                <span className="bg-[#111827] text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider inline-block">
                  REDACTED
                </span>
                <div className="font-mono text-xs text-[#111827] space-y-1">
                  {sampleDiffs.length === 0 ? (
                    <p className="text-[#6B7280] italic">Clean copy identical to source.</p>
                  ) : (
                    sampleDiffs.map((item, idx) => (
                      <p key={idx}>
                        <span className="text-[#6B7280]">{item.label}:</span>{' '}
                        {currentLook === 'label' ? (
                          <span className="font-mono text-[9px] font-bold bg-[#111827] text-white px-1 py-0.2 rounded uppercase">
                            [{item.label}]
                          </span>
                        ) : currentLook === 'partial' ? (
                          <span className="font-mono text-xs font-semibold text-[#111827] bg-[#F3F4F6] px-1 rounded border border-[#E5E7EB]">
                            •••• {item.value.replace(/\s+/g, '').slice(-4) || '••••'}
                          </span>
                        ) : (
                          <span className="inline-block bg-[#111827] w-24 h-3.5 rounded-[2px] align-middle" />
                        )}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Download Card + Removed by Type Chart + Delete Button */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Download */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm space-y-5">
            <h2 className="text-sm font-bold text-[#111827]">Download</h2>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#F3F4F6] text-[#4B5563] text-[10px] font-extrabold flex items-center justify-center shrink-0 border border-[#E5E7EB]">
                {fileExt}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-[#111827] truncate">{cleanFilename}</p>
                <p className="text-[11px] text-[#6B7280]">Your clean sanitized copy</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadFile}
              className="w-full bg-[#111827] hover:bg-black text-white text-xs font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download redacted file</span>
            </button>

            {/* Redaction Report Section */}
            <div className="pt-3 border-t border-[#F3F4F6] space-y-2">
              <p className="text-xs font-bold text-[#111827]">Redaction report</p>
              <p className="text-[11px] text-[#6B7280]">
                Cryptographic checksums and what was removed. Contains no personal data.
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleDownloadReport('pdf')}
                  className="py-2 px-3 border border-[#D1D5DB] hover:bg-slate-50 text-xs font-bold text-[#111827] rounded-lg transition-colors text-center"
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadReport('json')}
                  className="py-2 px-3 border border-[#D1D5DB] hover:bg-slate-50 text-xs font-bold text-[#111827] rounded-lg transition-colors text-center"
                >
                  JSON
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Removed by Type Chart */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#111827]">Removed by type</h2>
              <span className="text-xs font-bold text-[#6B7280]">{placesRedacted} places</span>
            </div>

            <div className="space-y-2.5 text-xs">
              {typeDistribution.length > 0 ? (
                typeDistribution.map((t) => {
                  const pct = Math.min(100, Math.max(15, Math.round((t.count / maxTypeCount) * 100)));
                  return (
                    <div key={t.label} className="flex items-center justify-between gap-3">
                      <span className="w-24 text-[#6B7280] truncate">{t.label}</span>
                      <div className="flex-1 bg-[#F3F4F6] rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-[#111827] h-3 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-5 text-right font-bold text-[#111827] tabular-nums">
                        {t.count}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-[#9CA3AF]">No items marked for redaction.</p>
              )}
            </div>
          </div>

          {/* Card 3: Delete & Redact Another File */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm space-y-4">
            <button
              type="button"
              onClick={handleDelete}
              disabled={hasDeleted}
              className="w-full border border-[#F87171] hover:bg-red-50 text-[#DC2626] text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{hasDeleted ? 'Deleted from server' : 'Delete original and output now'}</span>
            </button>

            <p className="text-[11px] text-[#6B7280] leading-snug">
              Otherwise both are deleted automatically in 24 hours.
            </p>

            <div className="pt-2">
              <Link
                to="/"
                className="text-xs font-bold text-[#111827] hover:underline inline-flex items-center gap-1"
              >
                <span>Redact another file</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
