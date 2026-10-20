import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Search,
  Plus,
  Shield,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useRedact } from '../context/RedactContext';

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { runs, setCurrentDocumentId, downloadReport } = useRedact();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VERIFIED' | 'IN_REVIEW' | 'FAILED' | 'UNSUPPORTED'>('ALL');
  const [failedModalRun, setFailedModalRun] = useState<string | null>(null);

  // Compute status counts
  const counts = useMemo(() => {
    return {
      all: runs.length,
      verified: runs.filter((r) => r.status === 'VERIFIED').length,
      inReview: runs.filter((r) => r.status === 'IN_REVIEW').length,
      failed: runs.filter((r) => r.status === 'FAILED').length,
      unsupported: runs.filter((r) => r.status === 'UNSUPPORTED').length,
    };
  }, [runs]);

  // Filtered list
  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      const matchesSearch =
        !searchQuery ||
        r.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.ruleSet.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'ALL') return true;
      return r.status === statusFilter;
    });
  }, [runs, searchQuery, statusFilter]);

  const handleAction = (run: typeof runs[0]) => {
    if (run.status === 'VERIFIED') {
      if (run.statusNote === 'Files deleted') {
        downloadReport(run.id, 'json');
      } else {
        setCurrentDocumentId(run.id);
        navigate(`/verify/${run.id}`);
      }
    } else if (run.status === 'IN_REVIEW') {
      setCurrentDocumentId(run.id);
      navigate(`/review/${run.id}`);
    } else if (run.status === 'FAILED') {
      setFailedModalRun(run.filename);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#111827]">
            History
          </h1>
          <p className="text-xs text-[#6B7280] mt-1">
            Everything you've redacted. Files are deleted 24 hours after export. The record and the
            report stay.
          </p>
        </div>

        <Link
          to="/"
          className="bg-[#111827] hover:bg-black text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm inline-flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New redaction</span>
        </Link>
      </div>

      {/* Search Bar & Filter Pills */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by file name"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#E5E7EB] bg-white focus:outline-none focus:border-[#111827] shadow-sm"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center flex-wrap gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              statusFilter === 'ALL'
                ? 'bg-[#111827] text-white shadow-sm'
                : 'bg-white border border-[#E5E7EB] text-[#4B5563] hover:text-[#111827]'
            }`}
          >
            All {counts.all}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('VERIFIED')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              statusFilter === 'VERIFIED'
                ? 'bg-[#111827] text-white shadow-sm'
                : 'bg-white border border-[#E5E7EB] text-[#4B5563] hover:text-[#111827]'
            }`}
          >
            Verified {counts.verified}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('IN_REVIEW')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              statusFilter === 'IN_REVIEW'
                ? 'bg-[#111827] text-white shadow-sm'
                : 'bg-white border border-[#E5E7EB] text-[#4B5563] hover:text-[#111827]'
            }`}
          >
            In review {counts.inReview}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('FAILED')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              statusFilter === 'FAILED'
                ? 'bg-[#111827] text-white shadow-sm'
                : 'bg-white border border-[#E5E7EB] text-[#4B5563] hover:text-[#111827]'
            }`}
          >
            Failed {counts.failed}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('UNSUPPORTED')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              statusFilter === 'UNSUPPORTED'
                ? 'bg-[#111827] text-white shadow-sm'
                : 'bg-white border border-[#E5E7EB] text-[#4B5563] hover:text-[#111827]'
            }`}
          >
            Unsupported {counts.unsupported}
          </button>
        </div>
      </div>

      {/* History Table Container */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#F3F4F6] text-[10px] font-bold text-[#6B7280] uppercase tracking-wider bg-[#F9FAFB]/50">
                <th className="py-3.5 px-6">FILE</th>
                <th className="py-3.5 px-4">RULE SET</th>
                <th className="py-3.5 px-4">FOUND</th>
                <th className="py-3.5 px-4">REDACTED</th>
                <th className="py-3.5 px-4">STATUS</th>
                <th className="py-3.5 px-4">WHEN</th>
                <th className="py-3.5 px-6 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[#6B7280]">
                    No runs found matching current filter.
                  </td>
                </tr>
              ) : (
                filteredRuns.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F9FAFB] transition-colors">
                    {/* File info */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded bg-[#F3F4F6] text-[#4B5563] text-[9px] font-extrabold flex items-center justify-center shrink-0 border border-[#E5E7EB]">
                          {r.format}
                        </span>
                        <div>
                          <p className="font-bold text-[#111827]">{r.filename}</p>
                        </div>
                      </div>
                    </td>

                    {/* Rule Set */}
                    <td className="py-4 px-4 text-[#4B5563] font-medium">{r.ruleSet}</td>

                    {/* Found */}
                    <td className="py-4 px-4 font-bold text-[#111827] tabular-nums">
                      {r.foundCount}
                    </td>

                    {/* Redacted */}
                    <td className="py-4 px-4 text-[#4B5563] tabular-nums">
                      {r.redactedCount}
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 px-4">
                      {r.status === 'VERIFIED' && (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>Verified</span>
                          </span>
                          {r.statusNote && (
                            <p className="text-[10px] text-[#6B7280]">{r.statusNote}</p>
                          )}
                        </div>
                      )}

                      {r.status === 'IN_REVIEW' && (
                        <span className="inline-flex items-center bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                          {r.reviewCount || 17} to review
                        </span>
                      )}

                      {r.status === 'FAILED' && (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA] text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                            <X className="w-3 h-3 stroke-[3]" />
                            <span>Failed</span>
                          </span>
                          {r.statusNote && (
                            <p className="text-[10px] text-[#991B1B] leading-tight max-w-xs">
                              {r.statusNote}
                            </p>
                          )}
                        </div>
                      )}

                      {r.status === 'UNSUPPORTED' && (
                        <div className="space-y-1">
                          <span className="inline-flex items-center bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB] text-[10px] font-semibold px-2.5 py-0.5 rounded-full">
                            Not supported yet
                          </span>
                          {r.statusNote && (
                            <p className="text-[10px] text-[#6B7280] leading-tight max-w-xs">
                              {r.statusNote}
                            </p>
                          )}
                        </div>
                      )}
                    </td>

                    {/* When */}
                    <td className="py-4 px-4 text-[#6B7280] tabular-nums whitespace-nowrap">
                      {r.when}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      {r.status === 'VERIFIED' && (
                        <button
                          type="button"
                          onClick={() => handleAction(r)}
                          className="px-4 py-1.5 rounded-lg border border-[#D1D5DB] hover:bg-slate-50 text-xs font-semibold text-[#111827] transition-colors"
                        >
                          {r.statusNote === 'Files deleted' ? 'Report' : 'Open'}
                        </button>
                      )}

                      {r.status === 'IN_REVIEW' && (
                        <button
                          type="button"
                          onClick={() => handleAction(r)}
                          className="px-4 py-1.5 rounded-lg bg-[#111827] hover:bg-black text-white text-xs font-semibold shadow-sm transition-colors"
                        >
                          Resume
                        </button>
                      )}

                      {r.status === 'FAILED' && (
                        <button
                          type="button"
                          onClick={() => handleAction(r)}
                          className="px-4 py-1.5 rounded-lg border border-[#D1D5DB] hover:bg-slate-50 text-xs font-semibold text-[#111827] transition-colors"
                        >
                          See why
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Security Guarantee Banner (Dark Card) */}
      <div className="bg-[#111827] text-white rounded-xl p-4 flex items-center gap-3 shadow-card">
        <Shield className="w-5 h-5 text-[#FACC15] shrink-0 stroke-[2.2]" />
        <p className="text-xs text-[#D1D5DB] leading-relaxed">
          <strong className="text-white">Why some runs say Failed.</strong> We never export a partly
          redacted file. If even one redaction can't be applied, the whole run stops and tells you
          why.
        </p>
      </div>

      {/* Failed Modal Explanation */}
      {failedModalRun && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-modal space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[#991B1B]">
                <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
                <span>ATOMIC REDACTION FAILURE</span>
              </div>
              <button
                type="button"
                onClick={() => setFailedModalRun(null)}
                className="text-[#9CA3AF] hover:text-[#111827]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <h2 className="text-base font-bold text-[#111827]">
              Why {failedModalRun} was rejected
            </h2>

            <p className="text-xs text-[#4B5563] leading-relaxed">
              During the redaction pass, 2 sensitive candidate tokens could not be cleanly overwritten
              without risking file structure corruption or layout drift.
            </p>

            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#991B1B] space-y-1">
              <p className="font-bold">Fail-Closed Invariant Enforced:</p>
              <p className="text-[11px] leading-snug">
                Because leaking even a single sensitive entity violates privacy regulations, the platform refused to release an incomplete file. 0 bytes were exported.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setFailedModalRun(null)}
                className="bg-[#111827] text-white text-xs font-bold px-4 py-2 rounded-xl"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
