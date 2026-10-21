import React, { useState } from 'react';
import { Plus, X, CheckCircle2 } from 'lucide-react';
import {
  useRedact,
  DETECTOR_DEFINITIONS,
} from '../context/RedactContext';

export const RulesPage: React.FC = () => {
  const {
    ruleSets,
    activeRuleSetId,
    activeRuleSet,
    setActiveRuleSetId,
    createRuleSet,
    updateActiveRuleSet,
    toggleDetector,
    addAlwaysRedact,
    removeAlwaysRedact,
    addNeverRedact,
    removeNeverRedact,
    setConfidenceThreshold,
    setDefaultLook,
    saveActiveRuleSet,
    discardRuleSetChanges,
  } = useRedact();

  const [alwaysInput, setAlwaysInput] = useState('');
  const [neverInput, setNeverInput] = useState('');
  const [newRuleSetName, setNewRuleSetName] = useState('');
  const [isCreatingModal, setIsCreatingModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleAddAlways = (e: React.FormEvent) => {
    e.preventDefault();
    if (!alwaysInput.trim()) return;
    addAlwaysRedact(alwaysInput);
    setAlwaysInput('');
  };

  const handleAddNever = (e: React.FormEvent) => {
    e.preventDefault();
    if (!neverInput.trim()) return;
    addNeverRedact(neverInput);
    setNeverInput('');
  };

  const handleSave = () => {
    saveActiveRuleSet();
    setToastMessage(`Saved changes to "${activeRuleSet.name}"`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDiscard = () => {
    discardRuleSetChanges();
    setToastMessage(`Discarded unsaved changes`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleSetName.trim()) return;
    createRuleSet(newRuleSetName);
    setNewRuleSetName('');
    setIsCreatingModal(false);
    setToastMessage(`Created new rule set "${newRuleSetName}"`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const renderBadge = (badgeText: string, badgeType: string) => {
    if (badgeType === 'heuristic') {
      return (
        <span className="bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">
          {badgeText}
        </span>
      );
    }
    if (badgeType === 'checksum') {
      return (
        <span className="bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">
          {badgeText}
        </span>
      );
    }
    return (
      <span className="bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB] text-[10px] font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap">
        {badgeText}
      </span>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Page Title & Subtitle */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#111827]">
          Rules
        </h1>
        <p className="text-xs text-[#6B7280] mt-1 max-w-2xl leading-relaxed">
          Choose what gets found and how it's handled. Pick any rule set when you start a new
          redaction.
        </p>
      </div>

      {toastMessage && (
        <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#059669]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Rule Sets Sidebar */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-2.5 shadow-sm space-y-1.5">
            {ruleSets.map((rs) => {
              const isSelected = rs.id === activeRuleSetId;
              if (isSelected) {
                return (
                  <div
                    key={rs.id}
                    className="bg-[#111827] text-white rounded-xl p-3 flex items-center justify-between shadow-sm cursor-pointer"
                  >
                    <div>
                      <p className="font-bold text-xs">{rs.name}</p>
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">{rs.typeSummary}</p>
                    </div>
                    {/* Yellow vertical indicator */}
                    <span className="w-1.5 h-6 bg-[#FACC15] rounded-full inline-block shrink-0" />
                  </div>
                );
              }

              return (
                <div
                  key={rs.id}
                  onClick={() => setActiveRuleSetId(rs.id)}
                  className="rounded-xl p-3 hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                >
                  <p className="font-bold text-xs text-[#111827]">{rs.name}</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">{rs.typeSummary}</p>
                </div>
              );
            })}

            {/* + New Rule Set Button */}
            <button
              type="button"
              onClick={() => setIsCreatingModal(true)}
              className="w-full border border-dashed border-[#D1D5DB] hover:border-[#111827] rounded-xl p-3 text-xs font-semibold text-[#111827] flex items-center justify-center gap-1.5 transition-colors bg-white mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New rule set</span>
            </button>
          </div>
        </div>

        {/* Right Column: Rule Set Editor Panel */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-[#E5E7EB] p-6 sm:p-8 shadow-sm space-y-8">
          {/* Top: Rule Set Name Input */}
          <div>
            <label className="block text-[11px] font-bold text-[#111827] mb-1">
              Rule set name
            </label>
            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                value={activeRuleSet.name}
                onChange={(e) =>
                  updateActiveRuleSet((rs) => ({ ...rs, name: e.target.value }))
                }
                className="flex-1 max-w-md px-3.5 py-2 text-xs font-bold text-[#111827] rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#111827] bg-[#F9FAFB]"
              />
              {activeRuleSet.startedFrom && (
                <span className="text-xs text-[#6B7280] font-medium shrink-0">
                  Started from {activeRuleSet.startedFrom}
                </span>
              )}
            </div>
          </div>

          {/* Section: What to look for */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#111827]">What to look for</h2>
              <p className="text-xs text-[#6B7280]">
                Each type shows how it's detected, so you know how much to trust it. Heuristic types
                are sent to review by default.
              </p>
            </div>

            {/* Detector List */}
            <div className="divide-y divide-[#F3F4F6] border-y border-[#F3F4F6]">
              {DETECTOR_DEFINITIONS.map((d) => {
                const isEnabled = activeRuleSet.detectors[d.id] ?? false;
                return (
                  <div
                    key={d.id}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      {/* Toggle Switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isEnabled}
                        onClick={() => toggleDetector(d.id)}
                        className={`w-9 h-5 rounded-full transition-colors relative shrink-0 p-0.5 ${
                          isEnabled ? 'bg-[#111827]' : 'bg-[#D1D5DB]'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 bg-white rounded-full transition-transform inline-block ${
                            isEnabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>

                      {/* Detector Info */}
                      <div>
                        <p className="text-xs font-bold text-[#111827]">{d.name}</p>
                        <p className="text-[10px] font-mono text-[#6B7280]">{d.sample}</p>
                      </div>
                    </div>

                    {/* Badge */}
                    <div className="shrink-0">{renderBadge(d.badgeText, d.badgeType)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: Always Redact & Never Redact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Left: Always Redact */}
            <div className="space-y-3">
              <div>
                <h3 className="text-xs font-bold text-[#111827]">Always redact</h3>
                <p className="text-[11px] text-[#6B7280]">
                  Words or phrases to black out wherever they appear.
                </p>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
                {activeRuleSet.alwaysRedact.map((tag) => (
                  <span
                    key={tag}
                    className="bg-[#111827] text-white font-mono text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeAlwaysRedact(tag)}
                      className="hover:text-red-400 font-bold"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add Input */}
              <form onSubmit={handleAddAlways} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={alwaysInput}
                  onChange={(e) => setAlwaysInput(e.target.value)}
                  placeholder="Add a word or phrase"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-[#E5E7EB] focus:outline-none focus:border-[#111827] bg-[#F9FAFB]"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-white border border-[#D1D5DB] hover:bg-slate-50 text-xs font-semibold rounded-lg text-[#111827]"
                >
                  Add
                </button>
              </form>
            </div>

            {/* Right: Never Redact */}
            <div className="space-y-3">
              <div>
                <h3 className="text-xs font-bold text-[#111827]">Never redact</h3>
                <p className="text-[11px] text-[#6B7280]">
                  Values that are safe to keep, like your company's own details.
                </p>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
                {activeRuleSet.neverRedact.map((tag) => (
                  <span
                    key={tag}
                    className="border border-[#D1D5DB] bg-white text-[#111827] font-mono text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeNeverRedact(tag)}
                      className="hover:text-red-600 font-bold"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add Input */}
              <form onSubmit={handleAddNever} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={neverInput}
                  onChange={(e) => setNeverInput(e.target.value)}
                  placeholder="Add a value to keep"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-[#E5E7EB] focus:outline-none focus:border-[#111827] bg-[#F9FAFB]"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-white border border-[#D1D5DB] hover:bg-slate-50 text-xs font-semibold rounded-lg text-[#111827]"
                >
                  Add
                </button>
              </form>
            </div>
          </div>

          {/* Section: How sure before we redact? & Default Look */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#F3F4F6]">
            {/* Left: Confidence Threshold Slider */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="text-xs font-bold text-[#111827]">
                    Detection confidence policy
                  </h3>
                  <p className="text-[11px] text-[#6B7280]">
                    Multi-signal evidence policy determining three-way outcomes: Auto-Redact, Manual Review, or Keep.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-bold text-[#111827] pt-2">
                <span className="text-[#6B7280] font-medium">Auto-redaction threshold</span>
                <span className="font-extrabold">{activeRuleSet.confidenceThreshold}%</span>
              </div>

              {/* Slider Track */}
              <input
                type="range"
                min="50"
                max="100"
                step="1"
                value={activeRuleSet.confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-[#E5E7EB] rounded-lg appearance-none cursor-pointer accent-[#111827]"
              />

              <div className="flex items-center justify-between text-[10px] text-[#6B7280]">
                <span>50% auto-redact more</span>
                <span>100% require stronger corroboration</span>
              </div>

              {/* Three-Way Decision Policy Breakdown */}
              <div className="p-3 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] space-y-2 mt-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#111827] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                    High Confidence (≥{activeRuleSet.confidenceThreshold}%)
                  </span>
                  <span className="font-mono font-bold text-[#065F46] bg-[#ECFDF5] px-2 py-0.5 rounded text-[10px]">
                    AUTO REDACT
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#111827] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                    Medium Corroboration (50% – {activeRuleSet.confidenceThreshold - 1}%)
                  </span>
                  <span className="font-mono font-bold text-[#92400E] bg-[#FEF3C7] px-2 py-0.5 rounded text-[10px]">
                    MANUAL REVIEW
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#111827] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#6B7280]" />
                    Low / Negative Context (&lt;50%)
                  </span>
                  <span className="font-mono font-bold text-[#374151] bg-[#F3F4F6] px-2 py-0.5 rounded text-[10px]">
                    KEEP UNTOUCHED
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Default Look */}
            <div className="space-y-2">
              <div>
                <h3 className="text-xs font-bold text-[#111827]">Default look</h3>
                <p className="text-[11px] text-[#6B7280]">
                  You can change it per file in the review screen.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                {/* Black bar */}
                <button
                  type="button"
                  onClick={() => setDefaultLook('bar')}
                  className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                    activeRuleSet.defaultLook === 'bar'
                      ? 'border-[#111827] bg-[#F9FAFB] shadow-sm'
                      : 'border-[#E5E7EB] hover:border-[#D1D5DB] bg-white'
                  }`}
                >
                  <div className="w-8 h-3.5 bg-[#111827] rounded-[2px]" />
                  <span className="text-[11px] font-semibold text-[#111827]">
                    Black bar
                  </span>
                </button>

                {/* Label */}
                <button
                  type="button"
                  onClick={() => setDefaultLook('label')}
                  className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                    activeRuleSet.defaultLook === 'label'
                      ? 'border-[#111827] bg-[#F9FAFB] shadow-sm'
                      : 'border-[#E5E7EB] hover:border-[#D1D5DB] bg-white'
                  }`}
                >
                  <span className="font-mono text-[9px] text-[#4B5563] bg-[#F3F4F6] px-1 py-0.5 rounded">
                    [PHONE]
                  </span>
                  <span className="text-[11px] font-semibold text-[#111827]">
                    Label
                  </span>
                </button>

                {/* Partial */}
                <button
                  type="button"
                  onClick={() => setDefaultLook('partial')}
                  className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                    activeRuleSet.defaultLook === 'partial'
                      ? 'border-[#111827] bg-[#F9FAFB] shadow-sm'
                      : 'border-[#E5E7EB] hover:border-[#D1D5DB] bg-white'
                  }`}
                >
                  <span className="font-mono text-[9px] text-[#4B5563]">
                    •••• 3210
                  </span>
                  <span className="text-[11px] font-semibold text-[#111827]">
                    Partial
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="pt-6 border-t border-[#F3F4F6] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleDiscard}
              className="px-4 py-2 rounded-xl border border-[#D1D5DB] hover:bg-slate-50 text-xs font-semibold text-[#111827] transition-colors"
            >
              Discard changes
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-[#111827] hover:bg-black text-white text-xs font-semibold shadow-sm transition-colors"
            >
              Save rule set
            </button>
          </div>
        </div>
      </div>

      {/* New Rule Set Creation Modal */}
      {isCreatingModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-modal space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#111827]">Create new rule set</h2>
              <button
                type="button"
                onClick={() => setIsCreatingModal(false)}
                className="text-[#9CA3AF] hover:text-[#111827]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNew} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">
                  Name
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. Legal Operations"
                  value={newRuleSetName}
                  onChange={(e) => setNewRuleSetName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#111827]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingModal(false)}
                  className="px-3 py-1.5 border border-[#D1D5DB] rounded-lg text-xs font-semibold text-[#4B5563]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#111827] text-white rounded-lg text-xs font-semibold"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
