import { PolicyEvaluator } from '../../src/services/policy/policyEvaluator';
import { IPIICandidate } from '../../src/models/piiCandidate.model';
import { IContextResult } from '../../src/models/contextResult.model';
import { IPolicy } from '../../src/models/policy.model';
import { PIIType, PIICategory } from '../../src/config/piiTaxonomy';

describe('Adversarial Decision Scenarios Unit Tests (Section 30)', () => {
  const basePolicy = {
    policyId: 'pol_adv_1',
    name: 'Adversarial Test Policy',
    version: 1,
    defaultDecision: 'REVIEW',
    rules: [
      {
        ruleId: 'r_email_customer',
        name: 'Redact Customer Email',
        priority: 50,
        action: 'REDACT',
        conditions: [
          { property: 'type', operator: 'EQUALS', value: 'EMAIL_ADDRESS' },
          { property: 'contextualScore', operator: 'GREATER_THAN', value: 0.6 },
        ],
        rationaleCode: 'REDACT_CUSTOMER_EMAIL',
      },
      {
        ruleId: 'r_rule_high',
        name: 'High Priority Keep',
        priority: 100,
        action: 'KEEP',
        conditions: [{ property: 'type', operator: 'EQUALS', value: 'CITY' }],
        rationaleCode: 'KEEP_CITY',
      },
      {
        ruleId: 'r_rule_low',
        name: 'Low Priority Redact',
        priority: 10,
        action: 'REDACT',
        conditions: [{ property: 'type', operator: 'EQUALS', value: 'CITY' }],
        rationaleCode: 'REDACT_CITY',
      },
    ],
  } as unknown as IPolicy;

  test('Case 1: Phone number candidate near Invoice Number label with CONFLICTING_CONTEXT falls back to REVIEW', () => {
    const candidate = {
      type: PIIType.PHONE_NUMBER,
      category: PIICategory.CONTACT_INFORMATION,
      detectionScore: 0.95,
      sensitivityScore: 0.7,
      recognitionConfidence: 1.0,
      detectorType: 'DETERMINISTIC',
      provenance: { sourceType: 'NATIVE_TEXT' },
    } as unknown as IPIICandidate;

    const contextResult = {
      contextualScore: 0.3,
      ambiguityIndicators: ['CONFLICTING_CONTEXT'],
      structuralContext: { isTable: false, isHeaderFooter: false },
    } as unknown as IContextResult;

    const outcome = PolicyEvaluator.evaluateCandidate(candidate, contextResult, basePolicy);

    expect(outcome.decision).toBe('REVIEW');
    expect(outcome.rationaleCodes).toContain('SAFEGUARD_CONTEXTUAL_CONFLICT_OR_WEAKNESS');
  });

  test('Case 2: Email candidate with Customer Email context and high contextualScore evaluates to REDACT', () => {
    const candidate = {
      type: PIIType.EMAIL_ADDRESS,
      category: PIICategory.CONTACT_INFORMATION,
      detectionScore: 0.98,
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

    const outcome = PolicyEvaluator.evaluateCandidate(candidate, contextResult, basePolicy);

    expect(outcome.decision).toBe('REDACT');
    expect(outcome.matchedRuleIds).toContain('r_email_customer');
  });

  test('Case 3: Government ID candidate with weak context and medium detection score evaluates safely', () => {
    const candidate = {
      type: PIIType.US_SSN,
      category: PIICategory.GOVERNMENT_ID,
      detectionScore: 0.75,
      sensitivityScore: 0.98,
      recognitionConfidence: 1.0,
      detectorType: 'DETERMINISTIC',
      provenance: { sourceType: 'NATIVE_TEXT' },
    } as unknown as IPIICandidate;

    const contextResult = {
      contextualScore: 0.4,
      ambiguityIndicators: ['WEAK_CONTEXT'],
      structuralContext: { isTable: false, isHeaderFooter: false },
    } as unknown as IContextResult;

    const outcome = PolicyEvaluator.evaluateCandidate(candidate, contextResult, basePolicy);

    expect(outcome.decision).toBe('REVIEW');
    expect(outcome.rationaleCodes).toContain('SAFEGUARD_CONTEXTUAL_CONFLICT_OR_WEAKNESS');
  });

  test('Case 4: Security credential AUTH_TOKEN_KEY with Example API Key negative signal triggers Critical Safety Override to REDACT', () => {
    const candidate = {
      type: PIIType.AUTH_TOKEN_KEY,
      category: PIICategory.SECURITY_CREDENTIAL,
      detectionScore: 0.99,
      sensitivityScore: 0.99,
      recognitionConfidence: 1.0,
      detectorType: 'DETERMINISTIC',
      provenance: { sourceType: 'NATIVE_TEXT' },
    } as unknown as IPIICandidate;

    const contextResult = {
      contextualScore: 0.2,
      ambiguityIndicators: ['WEAK_CONTEXT'],
      structuralContext: { isTable: false, isHeaderFooter: false },
    } as unknown as IContextResult;

    const outcome = PolicyEvaluator.evaluateCandidate(candidate, contextResult, basePolicy);

    expect(outcome.decision).toBe('REDACT');
    expect(outcome.rationaleCodes).toContain('CRITICAL_SAFETY_OVERRIDE_SECURITY_CREDENTIAL');
  });

  test('Case 5: Person name with ambiguous context falls back to REVIEW', () => {
    const candidate = {
      type: PIIType.PERSON_NAME,
      category: PIICategory.DIRECT_IDENTIFIER,
      detectionScore: 0.85,
      sensitivityScore: 0.65,
      recognitionConfidence: 1.0,
      detectorType: 'DETERMINISTIC',
      provenance: { sourceType: 'NATIVE_TEXT' },
    } as unknown as IPIICandidate;

    const contextResult = {
      contextualScore: 0.5,
      ambiguityIndicators: ['WEAK_CONTEXT'],
      structuralContext: { isTable: false, isHeaderFooter: false },
    } as unknown as IContextResult;

    const outcome = PolicyEvaluator.evaluateCandidate(candidate, contextResult, basePolicy);

    expect(outcome.decision).toBe('REVIEW');
  });

  test('Case 6: Two matching rules with conflicting actions break ties deterministically by priority order', () => {
    const candidate = {
      type: PIIType.CITY,
      category: PIICategory.LOCATION_DATA,
      detectionScore: 0.9,
      sensitivityScore: 0.3,
      recognitionConfidence: 1.0,
      detectorType: 'DETERMINISTIC',
      provenance: { sourceType: 'NATIVE_TEXT' },
    } as unknown as IPIICandidate;

    const contextResult = {
      contextualScore: 0.8,
      ambiguityIndicators: [],
      structuralContext: { isTable: false, isHeaderFooter: false },
    } as unknown as IContextResult;

    const outcome = PolicyEvaluator.evaluateCandidate(candidate, contextResult, basePolicy);

    // Highest priority rule (priority 100) is KEEP
    expect(outcome.decision).toBe('KEEP');
    expect(outcome.matchedRuleIds[0]).toBe('r_rule_high');
  });
});
