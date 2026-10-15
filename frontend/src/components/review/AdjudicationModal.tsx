import React, { useState, useEffect } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Alert } from '../ui/Alert';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { reviewApi } from '../../api/review.api';
import { HumanReviewCase, ReviewDecisionType, SubmitReviewDecisionPayload } from '../../types/review';
import { UserCheck } from 'lucide-react';

interface AdjudicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  caseItem: HumanReviewCase | null;
  onAdjudicationSuccess: () => void;
}

const DECISION_TYPE_OPTIONS: { value: ReviewDecisionType; label: string; desc: string }[] = [
  {
    value: 'CONFIRM_REDACTION',
    label: 'Confirm Redaction (Enforce Mandatory)',
    desc: 'Upholds PII classification; marks candidate for physical redaction mutation.',
  },
  {
    value: 'REJECT_FALSE_POSITIVE',
    label: 'Reject False Positive (Allow KEEP)',
    desc: 'Determines finding is not true PII or is publicly acceptable; allows document KEEP.',
  },
  {
    value: 'CONFIRM_FINDING',
    label: 'Confirm Finding (Validate Candidate)',
    desc: 'Confirms sensitive candidate presence without immediate redaction mandate.',
  },
  {
    value: 'REPORT_INCOMPLETE_REDACTION',
    label: 'Report Incomplete Redaction (Residual PII)',
    desc: 'Flags that prior transformation missed sensitive characters or offsets.',
  },
  {
    value: 'REQUEST_REPROCESSING',
    label: 'Request Reprocessing (Pipeline Re-Run)',
    desc: 'Sends document back to OCR / extraction stage for re-segmentation.',
  },
  {
    value: 'REQUEST_SECOND_REVIEW',
    label: 'Request Second Review (Dual-Control)',
    desc: 'Escalates to second distinct reviewer; self-approval strictly forbidden.',
  },
  {
    value: 'ESCALATE',
    label: 'Escalate to Senior Officer',
    desc: 'Transfers case authority to senior compliance or data protection officer.',
  },
  {
    value: 'INSUFFICIENT_EVIDENCE',
    label: 'Insufficient Evidence (Reject Case)',
    desc: 'Rejects review case due to incomplete provenance or unparseable context.',
  },
];

export const AdjudicationModal: React.FC<AdjudicationModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  caseItem,
  onAdjudicationSuccess,
}) => {
  const [decisionType, setDecisionType] = useState<ReviewDecisionType>('CONFIRM_REDACTION');
  const [reasonCode, setReasonCode] = useState('HUMAN_ADJUDICATION_CONFIRMED');
  const [safeRationale, setSafeRationale] = useState('');
  const [expectedNextAction, setExpectedNextAction] = useState('APPLY_MUTATION');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDecisionType('CONFIRM_REDACTION');
      setReasonCode('HUMAN_ADJUDICATION_CONFIRMED');
      setSafeRationale('');
      setExpectedNextAction('APPLY_MUTATION');
      setError(null);
      setShowDiscardPrompt(false);
    }
  }, [isOpen, caseItem]);

  const handleDecisionTypeChange = (val: ReviewDecisionType) => {
    setDecisionType(val);
    switch (val) {
      case 'CONFIRM_REDACTION':
        setReasonCode('HUMAN_ADJUDICATION_CONFIRMED');
        setExpectedNextAction('APPLY_MUTATION');
        break;
      case 'REJECT_FALSE_POSITIVE':
        setReasonCode('NON_PII_PUBLIC_CONTEXT');
        setExpectedNextAction('RESOLVE_CASE');
        break;
      case 'REQUEST_SECOND_REVIEW':
        setReasonCode('AMBIGUOUS_POLICY_SECOND_REVIEW_NEEDED');
        setExpectedNextAction('AWAIT_SECOND_REVIEW');
        break;
      case 'ESCALATE':
        setReasonCode('LEGAL_CONSULTATION_REQUIRED');
        setExpectedNextAction('OFFICER_REVIEW');
        break;
      case 'REQUEST_REPROCESSING':
        setReasonCode('EXTRACTION_CORRUPTION_SUSPECTED');
        setExpectedNextAction('REPROCESS_DOCUMENT');
        break;
      default:
        setReasonCode('HUMAN_ADJUDICATION_RECORDED');
        setExpectedNextAction('RESOLVE_CASE');
    }
  };

  const handleCloseAttempt = () => {
    if (safeRationale.trim().length > 0) {
      setShowDiscardPrompt(true);
    } else {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseItem) {
      setError('No active review case selected.');
      return;
    }

    if (!safeRationale.trim()) {
      setError('Please provide a safe adjudication rationale explaining this decision.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload: SubmitReviewDecisionPayload = {
      decisionType,
      reasonCode: reasonCode.trim() || 'HUMAN_ADJUDICATION_CONFIRMED',
      safeRationale: safeRationale.trim(),
      expectedNextAction,
      caseVersion: caseItem.caseVersion,
    };

    try {
      await reviewApi.submitDecision(organizationId, caseItem.reviewCaseId, payload);
      onAdjudicationSuccess();
      onClose();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to submit review decision';
      setError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!caseItem) return null;

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={handleCloseAttempt}
        title={`Adjudicate Review Case: ${caseItem.reviewCaseId}`}
        description={`Record authoritative human adjudication for Case v${caseItem.caseVersion} (Doc: ${caseItem.documentId?.substring(0, 10)}...).`}
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          {error && (
            <Alert variant="critical" title="Submission Error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Privacy & Zero Raw PII Invariant Alert */}
          <Alert variant="info" title="Zero Raw PII Security Advisory">
            Adjudication notes are permanently recorded in the organizational audit ledger.
            <strong> Do not paste unmasked sensitive tokens, passwords, or raw personal identifiers</strong> into
            the rationale text. All HTML and script tags will be sanitized server-side.
          </Alert>

          {/* Decision Type Selector */}
          <div>
            <label className="block font-semibold text-text-primary mb-1">
              Adjudication Action <span className="text-status-critical">*</span>
            </label>
            <Select
              value={decisionType}
              onChange={(e) => handleDecisionTypeChange(e.target.value as ReviewDecisionType)}
              options={DECISION_TYPE_OPTIONS.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
            />
            <p className="text-[11px] text-text-muted mt-1">
              {DECISION_TYPE_OPTIONS.find((o) => o.value === decisionType)?.desc}
            </p>
          </div>

          {/* Reason Code Input */}
          <div>
            <label className="block font-semibold text-text-primary mb-1">
              Machine-Readable Reason Code <span className="text-status-critical">*</span>
            </label>
            <Input
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              placeholder="e.g. HUMAN_ADJUDICATION_CONFIRMED"
              required
            />
          </div>

          {/* Expected Next Action */}
          <div>
            <label className="block font-semibold text-text-primary mb-1">
              Expected Pipeline Next Action
            </label>
            <Select
              value={expectedNextAction}
              onChange={(e) => setExpectedNextAction(e.target.value)}
              options={[
                { value: 'APPLY_MUTATION', label: 'APPLY_MUTATION — Execute physical redactions' },
                { value: 'RESOLVE_CASE', label: 'RESOLVE_CASE — Mark case completed without mutation' },
                { value: 'AWAIT_SECOND_REVIEW', label: 'AWAIT_SECOND_REVIEW — Route to secondary reviewer' },
                { value: 'OFFICER_REVIEW', label: 'OFFICER_REVIEW — Escalate to senior officer' },
                { value: 'REPROCESS_DOCUMENT', label: 'REPROCESS_DOCUMENT — Trigger re-extraction' },
              ]}
            />
          </div>

          {/* Safe Rationale Textarea */}
          <div>
            <label className="block font-semibold text-text-primary mb-1">
              Auditable Safe Rationale <span className="text-status-critical">*</span>
            </label>
            <textarea
              value={safeRationale}
              onChange={(e) => setSafeRationale(e.target.value)}
              placeholder="Provide clear compliance reasoning for this decision. (e.g. 'Confirmed Government ID candidate in line 3 is a direct personal identifier; redaction mandate upheld.')..."
              rows={4}
              maxLength={2000}
              required
              className="w-full px-3 py-2 text-xs rounded-md border border-surface-border bg-surface-white text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-brand-teal"
            />
            <div className="flex justify-between text-[11px] text-text-muted mt-0.5">
              <span>Markdown/Plain text supported; scripts stripped automatically.</span>
              <span className="tabular-nums">{safeRationale.length}/2000</span>
            </div>
          </div>

          {/* Concurrency Verification Notice */}
          <div className="p-2.5 rounded bg-surface-cool border border-surface-border flex items-center justify-between text-[11px] text-text-secondary">
            <span>
              Optimistic concurrency locked to Case Version: <strong className="font-mono text-brand-deep-teal">v{caseItem.caseVersion}</strong>
            </span>
            <span className="text-text-muted">Target Case: {caseItem.reviewCaseId}</span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-border">
            <Button variant="outline" size="sm" type="button" onClick={handleCloseAttempt} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              leftIcon={<UserCheck className="w-3.5 h-3.5" />}
            >
              Confirm & Submit Adjudication
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Discard Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDiscardPrompt}
        onClose={() => setShowDiscardPrompt(false)}
        onConfirm={() => {
          setShowDiscardPrompt(false);
          onClose();
        }}
        title="Discard Unsaved Adjudication Notes?"
        message="You have entered adjudication rationale that has not been submitted. If you leave now, your notes will be lost."
        confirmText="Discard Changes"
        variant="danger"
      />
    </>
  );
};
