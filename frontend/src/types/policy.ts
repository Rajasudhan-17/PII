export type DecisionType = 'KEEP' | 'REVIEW' | 'REDACT';
export type PolicyAction = 'REDACT' | 'MASK' | 'MUTATE' | 'GENERALIZE' | 'KEEP' | 'REVIEW';
export type PolicyStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

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
  | 'isHeaderFooter'
  | string;

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

export interface PolicyRuleCondition {
  property: RuleProperty;
  operator: RuleOperator;
  value?: unknown;
}

export interface PolicyRule {
  ruleId: string;
  name: string;
  priority: number;
  action: DecisionType;
  conditions: PolicyRuleCondition[];
  rationaleCode: string;
}

export interface Policy {
  _id?: string;
  policyId: string;
  organizationId: string;
  name: string;
  description?: string;
  version: number;
  status: PolicyStatus;
  isDefault?: boolean;
  defaultDecision: DecisionType;
  rules: PolicyRule[];
  configurationHash?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePolicyPayload {
  name: string;
  description?: string;
  defaultDecision?: DecisionType;
  rules?: PolicyRule[];
}

export interface CreatePolicyVersionPayload {
  name?: string;
  description?: string;
  defaultDecision?: DecisionType;
  rules: PolicyRule[];
}

export interface PoliciesResponse {
  success: boolean;
  data: {
    policies: Policy[];
  };
}

export interface PolicyDetailsResponse {
  success: boolean;
  data: {
    policyId: string;
    latestVersion: Policy;
    versions: Policy[];
  };
}

export interface DecisionResultItem {
  _id?: string;
  decisionResultId: string;
  decisionRunId: string;
  candidateId: string;
  documentId: string;
  organizationId: string;
  policyId: string;
  policyVersion: number;
  decision: DecisionType;
  decisionScore: number;
  matchedRuleIds: string[];
  rationaleCodes: string[];
  evaluationWarnings: string[];
  evaluatorVersion: string;
  policyConfigurationHash?: string;
  createdAt?: string;
}

// Backward compatibility alias
export type PolicyDecisionItem = DecisionResultItem;

export interface DecisionsSummary {
  totalEvaluated: number;
  keepCount: number;
  reviewCount: number;
  redactCount: number;
}

export interface DecisionRun {
  decisionRunId: string;
  status: string;
  decisionsSummary?: DecisionsSummary;
  createdAt?: string;
}

export interface DecisionResponse {
  success: boolean;
  data: {
    run: DecisionRun | null;
    results: DecisionResultItem[];
  };
}
