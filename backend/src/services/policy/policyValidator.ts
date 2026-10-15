import { DecisionType, IPolicyRule, RuleOperator, RuleProperty } from '../../config/policyTaxonomy';
import { AppError } from '../../utils/AppError';

export class PolicyValidator {
  private static VALID_DECISIONS: DecisionType[] = ['KEEP', 'REVIEW', 'REDACT'];
  private static VALID_OPERATORS: RuleOperator[] = [
    'EQUALS',
    'NOT_EQUALS',
    'GREATER_THAN',
    'GREATER_THAN_OR_EQUAL',
    'LESS_THAN',
    'LESS_THAN_OR_EQUAL',
    'IN',
    'NOT_IN',
    'EXISTS',
  ];
  private static VALID_PROPERTIES: RuleProperty[] = [
    'type',
    'category',
    'detectionScore',
    'sensitivityScore',
    'recognitionConfidence',
    'detectorType',
    'sourceType',
    'contextualScore',
    'semanticRole',
    'fieldLabel',
    'ambiguityIndicators',
    'isTable',
    'isHeaderFooter',
  ];

  public static validatePolicy(policy: {
    name: string;
    defaultDecision: DecisionType;
    rules: IPolicyRule[];
  }): void {
    if (!policy.name || policy.name.trim().length === 0) {
      throw AppError.badRequest('Policy name is required', 'INVALID_POLICY_NAME');
    }

    if (!this.VALID_DECISIONS.includes(policy.defaultDecision)) {
      throw AppError.badRequest(
        `Invalid default decision '${policy.defaultDecision}'. Must be one of KEEP, REVIEW, REDACT`,
        'INVALID_DEFAULT_DECISION'
      );
    }

    if (!Array.isArray(policy.rules)) {
      throw AppError.badRequest('Policy rules must be an array', 'INVALID_RULES_ARRAY');
    }

    const ruleIdSet = new Set<string>();

    for (const rule of policy.rules) {
      if (!rule.ruleId || rule.ruleId.trim().length === 0) {
        throw AppError.badRequest('Every policy rule must have a non-empty ruleId', 'MISSING_RULE_ID');
      }

      if (ruleIdSet.has(rule.ruleId)) {
        throw AppError.badRequest(
          `Duplicate ruleId '${rule.ruleId}' found in policy configuration`,
          'DUPLICATE_RULE_ID'
        );
      }
      ruleIdSet.add(rule.ruleId);

      if (!rule.name || rule.name.trim().length === 0) {
        throw AppError.badRequest(`Rule '${rule.ruleId}' is missing a name`, 'INVALID_RULE_NAME');
      }

      if (typeof rule.priority !== 'number' || isNaN(rule.priority)) {
        throw AppError.badRequest(`Rule '${rule.ruleId}' priority must be a valid number`, 'INVALID_RULE_PRIORITY');
      }

      if (!this.VALID_DECISIONS.includes(rule.action)) {
        throw AppError.badRequest(
          `Rule '${rule.ruleId}' has invalid action '${rule.action}'. Must be KEEP, REVIEW, or REDACT`,
          'INVALID_RULE_ACTION'
        );
      }

      if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
        throw AppError.badRequest(
          `Rule '${rule.ruleId}' must have at least one condition`,
          'EMPTY_RULE_CONDITIONS'
        );
      }

      for (const cond of rule.conditions) {
        if (!this.VALID_PROPERTIES.includes(cond.property)) {
          throw AppError.badRequest(
            `Rule '${rule.ruleId}' condition property '${cond.property}' is invalid`,
            'INVALID_CONDITION_PROPERTY'
          );
        }

        if (!this.VALID_OPERATORS.includes(cond.operator)) {
          throw AppError.badRequest(
            `Rule '${rule.ruleId}' condition operator '${cond.operator}' is invalid`,
            'INVALID_CONDITION_OPERATOR'
          );
        }
      }
    }
  }
}
