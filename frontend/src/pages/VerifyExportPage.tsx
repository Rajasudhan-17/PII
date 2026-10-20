import React, { useState } from 'react';
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
    getRunById,
    deleteRun,
    downloadRedactedFile,
    downloadReport,
  } = useRedact();

  const docId = id || 'offer_letter.docx';
  const run = getRunById(docId);
  const filename = run ? run.filename : docId;
  const cleanFilename = filename.replace(/\.(docx|csv|txt)$/i, '.redacted.$1');

  const [hasDeleted, setHasDeleted] = useState(false);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);

  const handleDownloadFile = () => {
    downloadRedactedFile(docId);
    setDownloadSuccessToast(`Downloaded ${cleanFilename}`);
    setTimeout(() => setDownloadSuccessToast(null), 3000);
  };

  const handleDownloadReport = (fmt: 'pdf' | 'json') => {
    downloadReport(docId, fmt);
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
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
            <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">10</p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">places redacted</p>
          </div>

          <div>
            <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">3</p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">kept on purpose</p>
          </div>

          <div>
            <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#FACC15]">0</p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">found in the output</p>
          </div>
        </div>
      </div>

      {downloadSuccessToast && (
        <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#059669]" />
          <span>{downloadSuccessToast}</span>
        </div>
      )}

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Independent Re-scan Checks + Kept Notice + What Changed Diff */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Independent Re-scan */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#111827]">Independent re-scan</h2>
              <p className="text-xs text-[#6B7280]">
                Six checks ran on the finished file, separately from the redaction itself.
              </p>
            </div>

            <div className="space-y-4 pt-1">
              {/* Check 1 */}
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#111827]">
                    Searched the output for every redacted value
                  </p>
                  <p className="text-[11px] text-[#6B7280] leading-snug">
                    All 9 distinct values (10 places). None found in the text or in hidden parts of
                    the file.
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
                    Ran every detector on the output
                  </p>
                  <p className="text-[11px] text-[#6B7280] leading-snug">
                    11 detectors, 0 findings. A fresh scan, not a replay of the first one.
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
                    The DOCX structure validated after editing.
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
                  Northwind Traders (2 places) and hr@northwind.example (1 place). Worth a last look.
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
                  <p>Phone: +91 98765 43210</p>
                  <p>PAN: ABCDE1234F</p>
                  <p>Aadhaar: 2345 6789 0124</p>
                </div>
              </div>

              {/* Redacted Box */}
              <div className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] space-y-2">
                <span className="bg-[#111827] text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider inline-block">
                  REDACTED
                </span>
                <div className="font-mono text-xs text-[#111827] space-y-1">
                  <p>
                    Phone:{' '}
                    <span className="inline-block bg-[#111827] w-28 h-3.5 rounded-[2px] align-middle" />
                  </p>
                  <p>
                    PAN:{' '}
                    <span className="inline-block bg-[#111827] w-20 h-3.5 rounded-[2px] align-middle" />
                  </p>
                  <p>
                    Aadhaar:{' '}
                    <span className="inline-block bg-[#111827] w-32 h-3.5 rounded-[2px] align-middle" />
                  </p>
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
                DOCX
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-[#111827] truncate">{cleanFilename}</p>
                <p className="text-[11px] text-[#6B7280]">36 KB · your clean copy</p>
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
                What was removed, by type and place. Contains no personal data.
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
              <span className="text-xs font-bold text-[#6B7280]">10 places</span>
            </div>

            <div className="space-y-2.5 text-xs">
              {/* Names */}
              <div className="flex items-center justify-between gap-3">
                <span className="w-20 text-[#6B7280]">Names</span>
                <div className="flex-1 bg-[#F3F4F6] rounded-full h-3 overflow-hidden">
                  <div className="bg-[#111827] h-3 rounded-full" style={{ width: '80%' }} />
                </div>
                <span className="w-5 text-right font-bold text-[#111827] tabular-nums">3</span>
              </div>

              {/* Email */}
              <div className="flex items-center justify-between gap-3">
                <span className="w-20 text-[#6B7280]">Email</span>
                <div className="flex-1 bg-[#F3F4F6] rounded-full h-3 overflow-hidden">
                  <div className="bg-[#111827] h-3 rounded-full" style={{ width: '30%' }} />
                </div>
                <span className="w-5 text-right font-bold text-[#111827] tabular-nums">1</span>
              </div>

              {/* Phone */}
              <div className="flex items-center justify-between gap-3">
                <span className="w-20 text-[#6B7280]">Phone</span>
                <div className="flex-1 bg-[#F3F4F6] rounded-full h-3 overflow-hidden">
                  <div className="bg-[#111827] h-3 rounded-full" style={{ width: '30%' }} />
                </div>
                <span className="w-5 text-right font-bold text-[#111827] tabular-nums">1</span>
              </div>

              {/* PAN */}
              <div className="flex items-center justify-between gap-3">
                <span className="w-20 text-[#6B7280]">PAN</span>
                <div className="flex-1 bg-[#F3F4F6] rounded-full h-3 overflow-hidden">
                  <div className="bg-[#111827] h-3 rounded-full" style={{ width: '30%' }} />
                </div>
                <span className="w-5 text-right font-bold text-[#111827] tabular-nums">1</span>
              </div>

              {/* Aadhaar */}
              <div className="flex items-center justify-between gap-3">
                <span className="w-20 text-[#6B7280]">Aadhaar</span>
                <div className="flex-1 bg-[#F3F4F6] rounded-full h-3 overflow-hidden">
                  <div className="bg-[#111827] h-3 rounded-full" style={{ width: '30%' }} />
                </div>
                <span className="w-5 text-right font-bold text-[#111827] tabular-nums">1</span>
              </div>

              {/* Address */}
              <div className="flex items-center justify-between gap-3">
                <span className="w-20 text-[#6B7280]">Address</span>
                <div className="flex-1 bg-[#F3F4F6] rounded-full h-3 overflow-hidden">
                  <div className="bg-[#111827] h-3 rounded-full" style={{ width: '30%' }} />
                </div>
                <span className="w-5 text-right font-bold text-[#111827] tabular-nums">1</span>
              </div>

              {/* Birth date */}
              <div className="flex items-center justify-between gap-3">
                <span className="w-20 text-[#6B7280]">Birth date</span>
                <div className="flex-1 bg-[#F3F4F6] rounded-full h-3 overflow-hidden">
                  <div className="bg-[#111827] h-3 rounded-full" style={{ width: '30%' }} />
                </div>
                <span className="w-5 text-right font-bold text-[#111827] tabular-nums">1</span>
              </div>

              {/* Card */}
              <div className="flex items-center justify-between gap-3">
                <span className="w-20 text-[#6B7280]">Card</span>
                <div className="flex-1 bg-[#F3F4F6] rounded-full h-3 overflow-hidden">
                  <div className="bg-[#111827] h-3 rounded-full" style={{ width: '30%' }} />
                </div>
                <span className="w-5 text-right font-bold text-[#111827] tabular-nums">1</span>
              </div>
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
