import crypto from 'crypto';

export type DecisionType = 'KEEP' | 'REVIEW' | 'REDACT';

export type RuleOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'IN'
  | 'NOT_IN'
  | 'EXISTS';

export type RuleProperty =
  | 'type'
  | 'category'
  | 'detectionScore'
  | 'sensitivityScore'
  | 'recognitionConfidence'
  | 'detectorType'
  | 'sourceType'
  | 'contextualScore'
  | 'semanticRole'
  | 'fieldLabel'
  | 'ambiguityIndicators'
  | 'isTable'
  | 'isHeaderFooter';

export interface IPolicyCondition {
  property: RuleProperty;
  operator: RuleOperator;
  value: unknown;
}

export interface IPolicyRule {
  ruleId: string;
  name: string;
  priority: number; // Higher number = higher priority
  action: DecisionType;
  conditions: IPolicyCondition[];
  rationaleCode: string;
}

export const POLICY_TAXONOMY_VERSION = '1.0.0';

export function generatePolicyConfigurationHash(policy: {
  version: number;
  defaultDecision: DecisionType;
  rules: IPolicyRule[];
}): string {
  const serialized = JSON.stringify({
    version: policy.version,
    defaultDecision: policy.defaultDecision,
    rules: policy.rules,
  });
  return crypto.createHash('sha256').update(serialized).digest('hex');
}
