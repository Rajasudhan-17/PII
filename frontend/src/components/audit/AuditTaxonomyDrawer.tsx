import React from 'react';
import { Button } from '../ui/Button';
import { AuditEventTaxonomyItem } from '../../types/audit';
import { X, Shield, Lock, FileCheck, Info, Tag } from 'lucide-react';

interface AuditTaxonomyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: AuditEventTaxonomyItem | null;
}

export const AuditTaxonomyDrawer: React.FC<AuditTaxonomyDrawerProps> = ({
  isOpen,
  onClose,
  item,
}) => {
  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-surface-white border-l border-surface-border shadow-2xl flex flex-col animate-slide-left">
      {/* Header */}
      <div className="p-4 border-b border-surface-border bg-surface-cool/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-brand-teal" />
          <div>
            <h2 className="text-sm font-bold text-brand-deep-teal font-mono">
              {item.event}
            </h2>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-muted">
              <span>Category: {item.category}</span>
              <span>•</span>
              <span>Lifecycle: {item.phase}</span>
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

      {/* Body */}
      <div className="p-4 flex-1 overflow-y-auto space-y-5 text-xs">
        {/* Description Card */}
        <div className="p-3 rounded-lg border border-surface-border bg-surface-white shadow-subtle space-y-1.5">
          <span className="text-[11px] font-semibold text-text-secondary flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-brand-teal" />
            Event Description
          </span>
          <p className="text-text-primary leading-relaxed text-xs">
            {item.description}
          </p>
        </div>

        {/* Compliance Relevance */}
        <div className="p-3 rounded-lg border border-brand-teal/30 bg-brand-pale-teal/30 space-y-1.5">
          <span className="text-[11px] font-semibold text-brand-deep-teal flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-brand-teal" />
            Compliance & Regulatory Mapping
          </span>
          <p className="text-brand-deep-teal text-xs leading-relaxed">
            {item.complianceRelevance}
          </p>
        </div>

        {/* Required Payload Schema */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-brand-deep-teal flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-brand-teal" />
            Authoritative Server Payload Structure
          </span>

          <div className="rounded-lg border border-surface-border bg-surface-cool/40 p-3 font-mono text-[11px] space-y-1.5">
            <div>
              <span className="text-text-muted">event: </span>
              <span className="text-brand-deep-teal font-semibold">&quot;{item.event}&quot;</span>
            </div>
            <div>
              <span className="text-text-muted">timestamp: </span>
              <span className="text-text-primary">ISO-8601 UTC String</span>
            </div>
            <div>
              <span className="text-text-muted">userId: </span>
              <span className="text-text-primary">Authenticated User ID or &quot;anonymous&quot;</span>
            </div>
            <div>
              <span className="text-text-muted">organizationId: </span>
              <span className="text-text-primary">Active Tenant ObjectId</span>
            </div>
            <div>
              <span className="text-text-muted">requestId: </span>
              <span className="text-text-primary">Correlation Request UUID</span>
            </div>
            <div>
              <span className="text-text-muted">outcome: </span>
              <span className="text-text-primary">&quot;SUCCESS&quot; | &quot;FAILURE&quot; | &quot;DENIED&quot; | &quot;LOCKED&quot;</span>
            </div>
            <div>
              <span className="text-text-muted">reason: </span>
              <span className="text-text-primary">Failure/Denial Explanation (Safe Rationale)</span>
            </div>
            <div>
              <span className="text-text-muted">details: </span>
              <span className="text-text-primary">Object (Entity IDs, hashes, counts; ZERO raw tokens)</span>
            </div>
          </div>
        </div>

        {/* Zero PII Guarantee Notice */}
        <div className="p-3 rounded-lg bg-surface-cool border border-surface-border space-y-1">
          <span className="font-semibold text-text-primary flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-brand-teal" />
            Privacy Invariant
          </span>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Under tenant security invariants, this event persists cryptographic SHA-256 hashes,
            entity references, and operational counts. Raw sensitive PII values are never recorded in
            audit payloads.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-surface-border bg-surface-cool/30 flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>
          Close Schema
        </Button>
      </div>
    </div>
  );
};
