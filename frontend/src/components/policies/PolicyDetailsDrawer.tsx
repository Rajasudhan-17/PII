import React from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Policy } from '../../types/policy';
import { X, Sliders, Shield, History, Plus, Hash } from 'lucide-react';

interface PolicyDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  policy: Policy | null;
  versions: Policy[];
  hasPolicyManage: boolean;
  onOpenCreateVersionModal: () => void;
}

export const PolicyDetailsDrawer: React.FC<PolicyDetailsDrawerProps> = ({
  isOpen,
  onClose,
  policy,
  versions,
  hasPolicyManage,
  onOpenCreateVersionModal,
}) => {
  if (!isOpen || !policy) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl bg-surface-white border-l border-surface-border shadow-2xl flex flex-col animate-slide-left">
      {/* Header */}
      <div className="p-4 border-b border-surface-border bg-surface-cool/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-teal" />
          <div>
            <h2 className="text-sm font-bold text-brand-deep-teal">{policy.name}</h2>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-muted">
              <span>ID: <code className="font-mono">{policy.policyId}</code></span>
              <span>•</span>
              <span>Version: <strong className="font-mono text-brand-deep-teal">v{policy.version}</strong></span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0 text-text-muted hover:text-text-primary"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Body Content */}
      <div className="p-4 flex-1 overflow-y-auto space-y-5 text-xs">
        {/* Status & Default Decision Card */}
        <div className="p-3 rounded-lg border border-surface-border bg-surface-white shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-[11px] text-text-muted block">Policy Status</span>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={policy.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                {policy.status}
              </Badge>
              {policy.isDefault && <Badge variant="teal">Default</Badge>}
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-text-muted block">Default Fallback Action</span>
            <span className="mt-1 inline-block">
              <Badge
                variant={
                  policy.defaultDecision === 'REDACT'
                    ? 'critical'
                    : policy.defaultDecision === 'REVIEW'
                      ? 'warning'
                      : 'success'
                }
              >
                {policy.defaultDecision}
              </Badge>
            </span>
          </div>
        </div>

        {/* Description */}
        {policy.description && (
          <div className="p-3 rounded-lg bg-surface-cool/40 border border-surface-border">
            <span className="text-[11px] font-semibold text-text-secondary block mb-1">
              Policy Description:
            </span>
            <p className="text-text-primary leading-relaxed">{policy.description}</p>
          </div>
        )}

        {/* Configuration Hash */}
        <div className="p-2.5 rounded bg-surface-cool border border-surface-border flex items-center justify-between text-[11px]">
          <span className="text-text-muted flex items-center gap-1">
            <Hash className="w-3.5 h-3.5 text-text-muted" />
            Config Hash:
          </span>
          <span className="font-mono text-text-secondary text-[10px] truncate max-w-xs" title={policy.configurationHash}>
            {policy.configurationHash || 'N/A'}
          </span>
        </div>

        {/* Rules Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-brand-deep-teal flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-brand-teal" />
              Configured Rules ({policy.rules?.length || 0})
            </span>
            <span className="text-[11px] text-text-muted">Ordered by priority</span>
          </div>

          {!policy.rules || policy.rules.length === 0 ? (
            <div className="p-4 text-center border border-dashed border-surface-border rounded bg-surface-cool/30 text-text-muted text-[11px]">
              No custom rules configured. All candidate entities evaluate to default fallback action ({policy.defaultDecision}).
            </div>
          ) : (
            <div className="space-y-3">
              {policy.rules
                .slice()
                .sort((a, b) => (a.priority || 0) - (b.priority || 0))
                .map((rule) => (
                  <div
                    key={rule.ruleId}
                    className="p-3 rounded-lg border border-surface-border bg-surface-white shadow-subtle space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-brand-deep-teal font-mono">
                          {rule.name}
                        </span>
                        <span className="text-[10px] text-text-muted font-mono">
                          ({rule.ruleId})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-text-muted tabular-nums">
                          Priority {rule.priority}
                        </span>
                        <Badge
                          variant={
                            rule.action === 'REDACT'
                              ? 'critical'
                              : rule.action === 'REVIEW'
                                ? 'warning'
                                : 'success'
                          }
                        >
                          {rule.action}
                        </Badge>
                      </div>
                    </div>

                    <div className="text-[11px] text-text-muted">
                      Rationale Code: <code className="font-mono text-text-primary">{rule.rationaleCode}</code>
                    </div>

                    {/* Conditions Table */}
                    <div className="pt-1.5 border-t border-surface-border/60">
                      <span className="text-[10px] text-text-muted font-semibold block mb-1">
                        Rule Conditions ({rule.conditions?.length || 0}):
                      </span>
                      <div className="space-y-1">
                        {rule.conditions?.map((cond, ci) => (
                          <div
                            key={ci}
                            className="p-1.5 rounded bg-surface-cool/60 border border-surface-border/70 font-mono text-[11px] flex items-center justify-between"
                          >
                            <span className="text-brand-deep-teal font-semibold">
                              {cond.property}
                            </span>
                            <span className="text-text-muted text-[10px]">
                              {cond.operator}
                            </span>
                            <span className="text-text-primary">
                              {typeof cond.value === 'object' ? JSON.stringify(cond.value) : String(cond.value ?? '')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Version History */}
        <div className="space-y-2 pt-2 border-t border-surface-border">
          <span className="text-xs font-semibold text-brand-deep-teal flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-brand-teal" />
            Immutable Version History ({versions.length})
          </span>

          <div className="space-y-2">
            {versions.map((ver) => (
              <div
                key={ver.version}
                className={`p-2.5 rounded border text-xs flex items-center justify-between ${
                  ver.version === policy.version
                    ? 'border-brand-teal bg-brand-pale-teal/30 font-medium'
                    : 'border-surface-border bg-surface-cool/20 text-text-secondary'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-brand-deep-teal">v{ver.version}</span>
                    <Badge variant={ver.status === 'PUBLISHED' ? 'success' : 'neutral'} size="sm">
                      {ver.status}
                    </Badge>
                    {ver.version === policy.version && (
                      <span className="text-[10px] text-brand-teal font-bold">(Viewing)</span>
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted block mt-0.5">
                    {ver.rules?.length || 0} rules • Default: {ver.defaultDecision}
                  </span>
                </div>
                <span className="text-[11px] text-text-muted tabular-nums">
                  {new Date(ver.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-surface-border bg-surface-cool/30 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onClose}>
          Close Details
        </Button>

        {hasPolicyManage && (
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenCreateVersionModal}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Create New Version (v{policy.version + 1})
          </Button>
        )}
      </div>
    </div>
  );
};
