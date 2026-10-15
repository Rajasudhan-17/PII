import React, { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Alert } from '../ui/Alert';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { policiesApi } from '../../api/policies.api';
import {
  DecisionType,
  PolicyRule,
  RuleOperator,
  RuleProperty,
  CreatePolicyPayload,
} from '../../types/policy';
import { Plus, Trash2 } from 'lucide-react';

interface CreatePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  onSuccess: () => void;
}

const PROPERTY_OPTIONS: { value: RuleProperty; label: string }[] = [
  { value: 'type', label: 'Candidate Type (e.g. US_SSN, PHONE_NUMBER)' },
  { value: 'category', label: 'Category (DIRECT_IDENTIFIER, QUASI_IDENTIFIER)' },
  { value: 'detectionScore', label: 'Detection Confidence Score (0.00-1.00)' },
  { value: 'sensitivityScore', label: 'Sensitivity Tier Score (0.00-1.00)' },
  { value: 'recognitionConfidence', label: 'OCR/HTR Recognition Confidence' },
  { value: 'detectorType', label: 'Detector Engine Type (PRESIDIO, REGEX, etc.)' },
  { value: 'sourceType', label: 'Source Stream Type (NATIVE_TEXT, PRINT_OCR)' },
  { value: 'contextualScore', label: 'Contextual Intelligence Score' },
  { value: 'fieldLabel', label: 'Nearby Form Field Label' },
  { value: 'isTable', label: 'Contained in Structural Table (true/false)' },
];

const OPERATOR_OPTIONS: { value: RuleOperator; label: string }[] = [
  { value: 'EQUALS', label: 'EQUALS (=)' },
  { value: 'NOT_EQUALS', label: 'NOT_EQUALS (!=)' },
  { value: 'GREATER_THAN', label: 'GREATER_THAN (>)' },
  { value: 'GREATER_THAN_OR_EQUAL', label: 'GREATER_THAN_OR_EQUAL (>=)' },
  { value: 'LESS_THAN', label: 'LESS_THAN (<)' },
  { value: 'LESS_THAN_OR_EQUAL', label: 'LESS_THAN_OR_EQUAL (<=)' },
  { value: 'IN', label: 'IN (list membership)' },
  { value: 'NOT_IN', label: 'NOT_IN (not in list)' },
  { value: 'EXISTS', label: 'EXISTS (property is present)' },
];

export const CreatePolicyModal: React.FC<CreatePolicyModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultDecision, setDefaultDecision] = useState<DecisionType>('REVIEW');
  const [rules, setRules] = useState<PolicyRule[]>([
    {
      ruleId: 'rule_gov_id_redact',
      name: 'Mandatory Government ID Redaction',
      priority: 10,
      action: 'REDACT',
      rationaleCode: 'MANDATORY_GOVERNMENT_ID_REDACTION',
      conditions: [
        {
          property: 'category',
          operator: 'EQUALS',
          value: 'DIRECT_IDENTIFIER',
        },
      ],
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);
  const [showConfirmCreate, setShowConfirmCreate] = useState(false);

  const handleAddRule = () => {
    const id = `rule_${Date.now().toString(36)}`;
    setRules((prev) => [
      ...prev,
      {
        ruleId: id,
        name: `Rule ${prev.length + 1}`,
        priority: (prev.length + 1) * 10,
        action: 'REDACT',
        rationaleCode: 'TENANT_CUSTOM_RULE',
        conditions: [
          {
            property: 'type',
            operator: 'EQUALS',
            value: 'PERSON_NAME',
          },
        ],
      },
    ]);
  };

  const handleRemoveRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddCondition = (ruleIndex: number) => {
    setRules((prev) => {
      const updated = [...prev];
      updated[ruleIndex].conditions.push({
        property: 'detectionScore',
        operator: 'GREATER_THAN_OR_EQUAL',
        value: '0.85',
      });
      return updated;
    });
  };

  const handleRemoveCondition = (ruleIndex: number, condIndex: number) => {
    setRules((prev) => {
      const updated = [...prev];
      updated[ruleIndex].conditions = updated[ruleIndex].conditions.filter((_, i) => i !== condIndex);
      return updated;
    });
  };

  const handleCloseAttempt = () => {
    if (name.trim().length > 0) {
      setShowDiscardPrompt(true);
    } else {
      onClose();
    }
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      setError('Policy Name is required.');
      return false;
    }

    const seenIds = new Set<string>();
    for (const rule of rules) {
      if (!rule.ruleId.trim()) {
        setError('Every rule must specify a valid ruleId.');
        return false;
      }
      if (seenIds.has(rule.ruleId.trim())) {
        setError(`Duplicate ruleId detected: '${rule.ruleId}'. Rule identifiers must be unique.`);
        return false;
      }
      seenIds.add(rule.ruleId.trim());

      if (!rule.name.trim()) {
        setError(`Rule '${rule.ruleId}' is missing a name.`);
        return false;
      }

      if (rule.conditions.length === 0) {
        setError(`Rule '${rule.ruleId}' must have at least one condition.`);
        return false;
      }
    }

    return true;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (validateForm()) {
      setShowConfirmCreate(true);
    }
  };

  const executeCreate = async () => {
    setShowConfirmCreate(false);
    setIsSubmitting(true);
    setError(null);

    const payload: CreatePolicyPayload = {
      name: name.trim(),
      description: description.trim(),
      defaultDecision,
      rules: rules.map((r) => ({
        ...r,
        priority: Number(r.priority) || 10,
        conditions: r.conditions.map((c) => ({
          ...c,
          // Format numeric strings if operator is numeric
          value:
            c.operator === 'GREATER_THAN' ||
            c.operator === 'LESS_THAN' ||
            c.operator === 'GREATER_THAN_OR_EQUAL' ||
            c.operator === 'LESS_THAN_OR_EQUAL'
              ? !isNaN(Number(c.value))
                ? Number(c.value)
                : c.value
              : c.value,
        })),
      })),
    };

    try {
      await policiesApi.createPolicy(organizationId, payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={handleCloseAttempt}
        title="Create Privacy Policy"
        description="Configure a new tenant-scoped policy with deterministic priority rules and fallback actions."
        maxWidth="lg"
      >
        <form onSubmit={handleFormSubmit} className="space-y-5 text-xs">
          {error && (
            <Alert variant="critical" title="Validation Error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Policy Name & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-text-primary mb-1">
                Policy Name <span className="text-status-critical">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Enterprise Financial Strict Policy"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-text-primary mb-1">
                Default Fallback Action <span className="text-status-critical">*</span>
              </label>
              <Select
                value={defaultDecision}
                onChange={(e) => setDefaultDecision(e.target.value as DecisionType)}
                options={[
                  { value: 'REVIEW', label: 'REVIEW — Route un-matched entities to human review queue' },
                  { value: 'REDACT', label: 'REDACT — Mandatorily redact all un-matched entities' },
                  { value: 'KEEP', label: 'KEEP — Preserve un-matched entities' },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-text-primary mb-1">
              Description (Optional)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the compliance scope and regulatory standard of this policy..."
            />
          </div>

          {/* Rules Builder */}
          <div className="space-y-3 pt-2 border-t border-surface-border">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-brand-deep-teal text-xs block">
                  Policy Rules ({rules.length})
                </span>
                <span className="text-[11px] text-text-muted">
                  Rules are evaluated in ascending priority order (lower number = higher precedence).
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={handleAddRule}
                className="h-7 text-xs px-2.5"
                leftIcon={<Plus className="w-3 h-3" />}
              >
                Add Rule
              </Button>
            </div>

            {rules.map((rule, ri) => (
              <div
                key={ri}
                className="p-3.5 rounded-lg border border-surface-border bg-surface-cool/30 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <span className="text-[10px] text-text-muted block mb-0.5">Rule ID:</span>
                      <Input
                        value={rule.ruleId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRules((prev) => {
                            const updated = [...prev];
                            updated[ri].ruleId = val;
                            return updated;
                          });
                        }}
                        placeholder="rule_identifier"
                        className="h-7 text-xs font-mono"
                        required
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <span className="text-[10px] text-text-muted block mb-0.5">Rule Name:</span>
                      <Input
                        value={rule.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRules((prev) => {
                            const updated = [...prev];
                            updated[ri].name = val;
                            return updated;
                          });
                        }}
                        placeholder="Rule display title"
                        className="h-7 text-xs"
                        required
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-text-muted block mb-0.5">Action:</span>
                      <Select
                        value={rule.action}
                        onChange={(e) => {
                          const val = e.target.value as DecisionType;
                          setRules((prev) => {
                            const updated = [...prev];
                            updated[ri].action = val;
                            return updated;
                          });
                        }}
                        options={[
                          { value: 'REDACT', label: 'REDACT' },
                          { value: 'REVIEW', label: 'REVIEW' },
                          { value: 'KEEP', label: 'KEEP' },
                        ]}
                      />
                    </div>
                  </div>

                  {rules.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => handleRemoveRule(ri)}
                      className="h-7 w-7 p-0 text-status-critical hover:bg-red-50"
                      title="Remove Rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[10px] text-text-muted block mb-0.5">Priority:</span>
                    <Input
                      type="number"
                      value={rule.priority}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 10;
                        setRules((prev) => {
                          const updated = [...prev];
                          updated[ri].priority = val;
                          return updated;
                        });
                      }}
                      className="h-7 text-xs tabular-nums"
                      required
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted block mb-0.5">Rationale Code:</span>
                    <Input
                      value={rule.rationaleCode}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRules((prev) => {
                          const updated = [...prev];
                          updated[ri].rationaleCode = val;
                          return updated;
                        });
                      }}
                      className="h-7 text-xs font-mono"
                      required
                    />
                  </div>
                </div>

                {/* Conditions List */}
                <div className="space-y-1.5 pt-2 border-t border-surface-border/60">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-text-secondary">
                      Conditions ({rule.conditions.length}):
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => handleAddCondition(ri)}
                      className="h-6 text-[10px] px-1.5 text-brand-teal"
                    >
                      + Add Condition
                    </Button>
                  </div>

                  {rule.conditions.map((cond, ci) => (
                    <div key={ci} className="flex items-center gap-1.5">
                      <div className="w-1/3">
                        <Select
                          value={cond.property}
                          onChange={(e) => {
                            const val = e.target.value as RuleProperty;
                            setRules((prev) => {
                              const updated = [...prev];
                              updated[ri].conditions[ci].property = val;
                              return updated;
                            });
                          }}
                          options={PROPERTY_OPTIONS}
                        />
                      </div>
                      <div className="w-1/3">
                        <Select
                          value={cond.operator}
                          onChange={(e) => {
                            const val = e.target.value as RuleOperator;
                            setRules((prev) => {
                              const updated = [...prev];
                              updated[ri].conditions[ci].operator = val;
                              return updated;
                            });
                          }}
                          options={OPERATOR_OPTIONS}
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          value={typeof cond.value === 'object' ? JSON.stringify(cond.value) : String(cond.value ?? '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRules((prev) => {
                              const updated = [...prev];
                              updated[ri].conditions[ci].value = val;
                              return updated;
                            });
                          }}
                          placeholder="Value"
                          className="h-7 text-xs"
                          required
                        />
                      </div>
                      {rule.conditions.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => handleRemoveCondition(ri, ci)}
                          className="h-7 w-7 p-0 text-text-muted hover:text-status-critical"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-border">
            <Button variant="outline" size="sm" type="button" onClick={handleCloseAttempt} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Create Policy (v1)
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Confirmation of Consequential Creation */}
      <ConfirmationDialog
        isOpen={showConfirmCreate}
        onClose={() => setShowConfirmCreate(false)}
        onConfirm={() => { void executeCreate(); }}
        title="Confirm Policy Provisioning"
        message={`Are you sure you want to provision policy '${name}' with ${rules.length} rule(s) and default fallback action '${defaultDecision}'? This policy will be published and available for document decision evaluations.`}
        confirmText="Publish Policy"
        variant="primary"
      />

      {/* Discard Changes Prompt */}
      <ConfirmationDialog
        isOpen={showDiscardPrompt}
        onClose={() => setShowDiscardPrompt(false)}
        onConfirm={() => {
          setShowDiscardPrompt(false);
          onClose();
        }}
        title="Discard Unsaved Policy Configuration?"
        message="You have unsaved policy rules that will be lost if you leave now."
        confirmText="Discard Changes"
        variant="danger"
      />
    </>
  );
};
