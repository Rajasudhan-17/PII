import React, { useState, useEffect } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Alert } from '../ui/Alert';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { policiesApi } from '../../api/policies.api';
import {
  DecisionType,
  Policy,
  PolicyRule,
  RuleOperator,
  RuleProperty,
  CreatePolicyVersionPayload,
} from '../../types/policy';
import { Plus, Trash2 } from 'lucide-react';

interface CreatePolicyVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  basePolicy: Policy | null;
  onSuccess: () => void;
}

const PROPERTY_OPTIONS: { value: RuleProperty; label: string }[] = [
  { value: 'type', label: 'Candidate Type' },
  { value: 'category', label: 'Category (DIRECT vs QUASI)' },
  { value: 'detectionScore', label: 'Detection Score' },
  { value: 'sensitivityScore', label: 'Sensitivity Score' },
  { value: 'recognitionConfidence', label: 'Recognition Confidence' },
  { value: 'detectorType', label: 'Detector Engine Type' },
  { value: 'sourceType', label: 'Source Stream Type' },
  { value: 'contextualScore', label: 'Contextual Score' },
  { value: 'fieldLabel', label: 'Field Label' },
  { value: 'isTable', label: 'Is In Table' },
];

const OPERATOR_OPTIONS: { value: RuleOperator; label: string }[] = [
  { value: 'EQUALS', label: 'EQUALS (=)' },
  { value: 'NOT_EQUALS', label: 'NOT_EQUALS (!=)' },
  { value: 'GREATER_THAN', label: 'GREATER_THAN (>)' },
  { value: 'GREATER_THAN_OR_EQUAL', label: 'GREATER_THAN_OR_EQUAL (>=)' },
  { value: 'LESS_THAN', label: 'LESS_THAN (<)' },
  { value: 'LESS_THAN_OR_EQUAL', label: 'LESS_THAN_OR_EQUAL (<=)' },
  { value: 'IN', label: 'IN' },
  { value: 'NOT_IN', label: 'NOT_IN' },
  { value: 'EXISTS', label: 'EXISTS' },
];

export const CreatePolicyVersionModal: React.FC<CreatePolicyVersionModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  basePolicy,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultDecision, setDefaultDecision] = useState<DecisionType>('REVIEW');
  const [rules, setRules] = useState<PolicyRule[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmPrompt, setShowConfirmPrompt] = useState(false);

  useEffect(() => {
    if (basePolicy && isOpen) {
      setName(basePolicy.name);
      setDescription(basePolicy.description || '');
      setDefaultDecision(basePolicy.defaultDecision || 'REVIEW');
      setRules(
        basePolicy.rules && basePolicy.rules.length > 0
          ? JSON.parse(JSON.stringify(basePolicy.rules))
          : []
      );
      setError(null);
    }
  }, [basePolicy, isOpen]);

  if (!basePolicy) return null;

  const nextVersionNum = basePolicy.version + 1;

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

  const validateForm = (): boolean => {
    if (rules.length === 0) {
      setError('Policy version must contain at least one rule.');
      return false;
    }

    const seenIds = new Set<string>();
    for (const rule of rules) {
      if (!rule.ruleId.trim()) {
        setError('Every rule must have a non-empty ruleId.');
        return false;
      }
      if (seenIds.has(rule.ruleId.trim())) {
        setError(`Duplicate ruleId '${rule.ruleId}'.`);
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
      setShowConfirmPrompt(true);
    }
  };

  const executeCreateVersion = async () => {
    setShowConfirmPrompt(false);
    setIsSubmitting(true);
    setError(null);

    const payload: CreatePolicyVersionPayload = {
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      defaultDecision,
      rules: rules.map((r) => ({
        ...r,
        priority: Number(r.priority) || 10,
        conditions: r.conditions.map((c) => ({
          ...c,
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
      await policiesApi.createPolicyVersion(organizationId, basePolicy.policyId, payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to publish new policy version');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title={`Publish New Version: ${basePolicy.name} (v${nextVersionNum})`}
        description={`Creates an immutable incremented policy version v${nextVersionNum} while preserving previous historical runs.`}
        maxWidth="lg"
      >
        <form onSubmit={handleFormSubmit} className="space-y-5 text-xs">
          {error && (
            <Alert variant="critical" title="Validation Error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Alert variant="info" title="Cryptographic Immutability Notice">
            Existing decision runs evaluated against v{basePolicy.version} will remain bound to their
            historical configuration hash. New document evaluations will automatically execute against
            the latest published version (v{nextVersionNum}).
          </Alert>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-text-primary mb-1">
                Version Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Policy display name"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-text-primary mb-1">
                Default Action
              </label>
              <Select
                value={defaultDecision}
                onChange={(e) => setDefaultDecision(e.target.value as DecisionType)}
                options={[
                  { value: 'REVIEW', label: 'REVIEW — Route un-matched to human review' },
                  { value: 'REDACT', label: 'REDACT — Mandatorily redact un-matched' },
                  { value: 'KEEP', label: 'KEEP — Preserve un-matched' },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-text-primary mb-1">
              Version Changelog / Description
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Added strict threshold override for direct identifiers..."
            />
          </div>

          {/* Rules Builder */}
          <div className="space-y-3 pt-2 border-t border-surface-border">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-brand-deep-teal text-xs block">
                  Version Rules ({rules.length})
                </span>
                <span className="text-[11px] text-text-muted">
                  Rules in v{nextVersionNum} evaluated by priority precedence.
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

                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => handleRemoveRule(ri)}
                    className="h-7 w-7 p-0 text-status-critical hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
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

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-border">
            <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Publish Version v{nextVersionNum}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmationDialog
        isOpen={showConfirmPrompt}
        onClose={() => setShowConfirmPrompt(false)}
        onConfirm={() => { void executeCreateVersion(); }}
        title={`Publish Policy Version v${nextVersionNum}?`}
        message={`Are you sure you want to publish version v${nextVersionNum} for '${basePolicy.name}' with ${rules.length} rule(s)? Subsequent document evaluations will apply this new configuration.`}
        confirmText={`Publish v${nextVersionNum}`}
        variant="primary"
      />
    </>
  );
};
