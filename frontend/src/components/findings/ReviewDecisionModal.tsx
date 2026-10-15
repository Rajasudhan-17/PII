import React, { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Alert } from '../ui/Alert';
import { findingsApi } from '../../api/findings.api';
import { ReviewDecisionType, SubmitReviewDecisionPayload } from '../../types/review';
import { UserCheck } from 'lucide-react';

interface ReviewDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  caseId: string | null;
  caseVersion?: number;
  onDecisionSubmitted: () => void;
}

const DECISION_TYPE_OPTIONS = [
  { value: 'CONFIRM_REDACTION', label: 'Confirm Redaction (Enforce)' },
  { value: 'REJECT_FALSE_POSITIVE', label: 'Reject False Positive (Allow Keep)' },
  { value: 'CONFIRM_FINDING', label: 'Confirm Finding' },
  { value: 'REQUEST_REPROCESSING', label: 'Request Reprocessing' },
  { value: 'REQUEST_SECOND_REVIEW', label: 'Request Second Review' },
  { value: 'ESCALATE', label: 'Escalate to Senior Officer' },
  { value: 'INSUFFICIENT_EVIDENCE', label: 'Insufficient Evidence' },
];

export const ReviewDecisionModal: React.FC<ReviewDecisionModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  caseId,
  caseVersion = 1,
  onDecisionSubmitted,
}) => {
  const [decisionType, setDecisionType] = useState<ReviewDecisionType>('CONFIRM_REDACTION');
  const [reasonCode, setReasonCode] = useState('HUMAN_ADJUDICATION_CONFIRMED');
  const [safeRationale, setSafeRationale] = useState('');
  const [expectedNextAction, setExpectedNextAction] = useState('APPLY_MUTATION');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) {
      setError('No active review case selected.');
      return;
    }

    if (!safeRationale.trim()) {
      setError('Please provide a safe adjudication rationale explaining the decision.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: SubmitReviewDecisionPayload = {
        decisionType,
        reasonCode,
        safeRationale: safeRationale.trim(),
        expectedNextAction,
        caseVersion,
      };

      await findingsApi.submitReviewDecision(organizationId, caseId, payload);
      onDecisionSubmitted();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit review decision.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Human Review Adjudication"
      description={`Record an authorized reviewer adjudication for review case [${caseId || 'none'}].`}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            leftIcon={<UserCheck className="w-3.5 h-3.5" />}
          >
            Submit Decision
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="critical" title="Adjudication Notice" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div>
          <Select
            label="Adjudication Decision Type"
            value={decisionType}
            onChange={(e) => setDecisionType(e.target.value as ReviewDecisionType)}
            options={DECISION_TYPE_OPTIONS}
          />
        </div>

        <div>
          <Input
            label="Reason Code"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            placeholder="e.g. MANUAL_OVERRIDE_VERIFIED"
            helperText="Standardized audit taxonomy code"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-primary mb-1.5">
            Safe Adjudication Rationale
          </label>
          <textarea
            value={safeRationale}
            onChange={(e) => setSafeRationale(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-xs rounded-md border border-surface-border bg-surface-white text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
            placeholder="Document legal or compliance justification (do not include raw PII)..."
            required
          />
          <span className="text-[10px] text-text-muted block mt-1">
            Zero PII Invariant: Do not paste sensitive personal tokens into audit rationales.
          </span>
        </div>

        <div>
          <Input
            label="Expected Next Pipeline Action"
            value={expectedNextAction}
            onChange={(e) => setExpectedNextAction(e.target.value)}
            placeholder="e.g. APPLY_MUTATION or CERTIFY_RELEASE"
          />
        </div>
      </form>
    </Dialog>
  );
};
