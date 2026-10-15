import { PolicyValidator } from '../../src/services/policy/policyValidator';
import { DecisionType, RuleOperator } from '../../src/config/policyTaxonomy';

describe('PolicyValidator Unit Tests', () => {
  test('should validate a valid policy structure without throwing', () => {
    const validPolicy = {
      name: 'Default Protection Policy',
      defaultDecision: 'REVIEW' as DecisionType,
      rules: [
        {
          ruleId: 'r_1',
          name: 'Redact SSN',
          priority: 10,
          action: 'REDACT' as DecisionType,
          conditions: [{ property: 'type' as const, operator: 'EQUALS' as const, value: 'US_SSN' }],
          rationaleCode: 'RULE_MATCH_SSN',
        },
      ],
    };

    expect(() => PolicyValidator.validatePolicy(validPolicy)).not.toThrow();
  });

  test('should reject policy with empty or whitespace name', () => {
    expect(() =>
      PolicyValidator.validatePolicy({
        name: '   ',
        defaultDecision: 'REVIEW',
        rules: [],
      })
    ).toThrow('Policy name is required');
  });

  test('should reject duplicate rule IDs in policy configuration', () => {
    const invalidPolicy = {
      name: 'Duplicate Rule Policy',
      defaultDecision: 'REVIEW' as DecisionType,
      rules: [
        {
          ruleId: 'r_dup',
          name: 'Rule 1',
          priority: 10,
          action: 'REDACT' as DecisionType,
          conditions: [{ property: 'type' as const, operator: 'EQUALS' as const, value: 'US_SSN' }],
          rationaleCode: 'CODE_1',
        },
        {
          ruleId: 'r_dup',
          name: 'Rule 2',
          priority: 5,
          action: 'KEEP' as DecisionType,
          conditions: [{ property: 'type' as const, operator: 'EQUALS' as const, value: 'EMAIL_ADDRESS' }],
          rationaleCode: 'CODE_2',
        },
      ],
    };

    expect(() => PolicyValidator.validatePolicy(invalidPolicy)).toThrow("Duplicate ruleId 'r_dup'");
  });

  test('should reject invalid condition operator', () => {
    const invalidPolicy = {
      name: 'Bad Operator Policy',
      defaultDecision: 'REVIEW' as DecisionType,
      rules: [
        {
          ruleId: 'r_bad_op',
          name: 'Bad Op',
          priority: 1,
          action: 'REDACT' as DecisionType,
          conditions: [{ property: 'type' as const, operator: 'INVALID_OP' as unknown as RuleOperator, value: 'US_SSN' }],
          rationaleCode: 'CODE_BAD',
        },
      ],
    };

    expect(() => PolicyValidator.validatePolicy(invalidPolicy)).toThrow("condition operator 'INVALID_OP' is invalid");
  });
});
