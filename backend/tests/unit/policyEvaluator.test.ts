import { PolicyEvaluator } from '../../src/services/policy/policyEvaluator';
import { IPIICandidate } from '../../src/models/piiCandidate.model';
import { IContextResult } from '../../src/models/contextResult.model';
import { IPolicy } from '../../src/models/policy.model';
import { PIIType, PIICategory } from '../../src/config/piiTaxonomy';

describe('PolicyEvaluator Unit Tests', () => {
  const mockPolicy = {
    policyId: 'pol_unit_1',
    name: 'Unit Policy',
    version: 1,
    defaultDecision: 'REVIEW',
    rules: [
      {
        ruleId: 'r_email_high_context',
        name: 'Redact High Context Email',
        priority: 20,
        action: 'REDACT',
        conditions: [
          { property: 'type', operator: 'EQUALS', value: 'EMAIL_ADDRESS' },
          { property: 'contextualScore', operator: 'GREATER_THAN_OR_EQUAL', value: 0.7 },
        ],
        rationaleCode: 'REDACT_HIGH_CONTEXT_EMAIL',
      },
      {
        ruleId: 'r_keep_low_sens',
        name: 'Keep Low Sensitivity City',
        priority: 10,
        action: 'KEEP',
        conditions: [{ property: 'type', operator: 'EQUALS', value: 'CITY' }],
        rationaleCode: 'KEEP_CITY_NAME',
      },
    ],
  } as unknown as IPolicy;

  test('should match highest priority rule and evaluate decision to REDACT', () => {
    const candidate = {
      type: PIIType.EMAIL_ADDRESS,
      category: PIICategory.CONTACT_INFORMATION,
      detectionScore: 0.95,
      sensitivityScore: 0.75,
      recognitionConfidence: 1.0,
      detectorType: 'DETERMINISTIC',
      provenance: { sourceType: 'NATIVE_TEXT' },
    } as unknown as IPIICandidate;

    const contextResult = {
      contextualScore: 0.85,
      ambiguityIndicators: [],
      structuralContext: { isTable: false, isHeaderFooter: false },
    } as unknown as IContextResult;

    const outcome = PolicyEvaluator.evaluateCandidate(candidate, contextResult, mockPolicy);

    expect(outcome.decision).toBe('REDACT');
    expect(outcome.matchedRuleIds).toContain('r_email_high_context');
    expect(outcome.rationaleCodes).toContain('REDACT_HIGH_CONTEXT_EMAIL');
  });

  test('should fallback to policy default decision REVIEW when no rule matches', () => {
    const candidate = {
      type: PIIType.PHONE_NUMBER,
      category: PIICategory.CONTACT_INFORMATION,
      detectionScore: 0.8,
      sensitivityScore: 0.7,
      recognitionConfidence: 1.0,
      detectorType: 'DETERMINISTIC',
      provenance: { sourceType: 'NATIVE_TEXT' },
    } as unknown as IPIICandidate;

    const contextResult = {
      contextualScore: 0.5,
      ambiguityIndicators: [],
      structuralContext: { isTable: false, isHeaderFooter: false },
    } as unknown as IContextResult;

    const outcome = PolicyEvaluator.evaluateCandidate(candidate, contextResult, mockPolicy);

    expect(outcome.decision).toBe('REVIEW');
    expect(outcome.rationaleCodes).toContain('POLICY_DEFAULT');
  });
});
