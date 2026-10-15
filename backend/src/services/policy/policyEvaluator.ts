import { IPIICandidate } from '../../models/piiCandidate.model';
import { IContextResult } from '../../models/contextResult.model';
import { IPolicy } from '../../models/policy.model';
import { DecisionType, IPolicyRule, IPolicyCondition } from '../../config/policyTaxonomy';
import { PIIType, PIICategory } from '../../config/piiTaxonomy';

export interface EvaluationOutcome {
  decision: DecisionType;
  decisionScore: number;
  matchedRuleIds: string[];
  rationaleCodes: string[];
  evaluationWarnings: string[];
}

export class PolicyEvaluator {
  public static EVALUATOR_VERSION = '1.0.0';

  public static evaluateCandidate(
    candidate: IPIICandidate,
    contextResult: IContextResult | null,
    policy: IPolicy
  ): EvaluationOutcome {
    const matchedRuleIds: string[] = [];
    const rationaleCodes: string[] = [];
    const evaluationWarnings: string[] = [];
    let decision: DecisionType | null = null;
    let decisionScore = 0.5;

    // 1. Collect and sort rules by priority descending, tie-break by ruleId ascending
    const sortedRules = [...(policy.rules || [])].sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.ruleId.localeCompare(b.ruleId);
    });

    // 2. Evaluate rules against candidate & context
    for (const rule of sortedRules) {
      if (this.matchesRule(candidate, contextResult, rule)) {
        matchedRuleIds.push(rule.ruleId);
        if (!decision) {
          decision = rule.action;
          rationaleCodes.push(rule.rationaleCode || `RULE_MATCH_${rule.ruleId}`);
        }
      }
    }

    // 3. Apply Decision Precedence Hierarchy
    if (decision) {
      decisionScore = decision === 'REDACT' ? 0.95 : decision === 'KEEP' ? 0.1 : 0.5;
    } else {
      // Precedence Step 1: Unconditional Platform Safety Override (Security Credentials & Auth Tokens)
      const isSecurityCredential =
        candidate.type === PIIType.AUTH_TOKEN_KEY ||
        candidate.category === PIICategory.SECURITY_CREDENTIAL ||
        (candidate.type as string) === 'API_KEY' ||
        (candidate.type as string) === 'PRIVATE_KEY';

      if (isSecurityCredential) {
        decision = 'REDACT';
        decisionScore = 0.99;
        rationaleCodes.push('CRITICAL_SAFETY_OVERRIDE_SECURITY_CREDENTIAL');
      }
      // Precedence Step 2: Conflict / Ambiguity Safeguard
      else if (
        contextResult &&
        (contextResult.ambiguityIndicators.includes('CONFLICTING_CONTEXT') ||
          contextResult.ambiguityIndicators.includes('WEAK_CONTEXT'))
      ) {
        decision = 'REVIEW';
        decisionScore = 0.5;
        rationaleCodes.push('SAFEGUARD_CONTEXTUAL_CONFLICT_OR_WEAKNESS');
      }
      // Precedence Step 3: Low Confidence Safeguard
      else if (candidate.detectionScore < 0.5) {
        decision = 'REVIEW';
        decisionScore = 0.4;
        rationaleCodes.push('SAFEGUARD_LOW_DETECTION_CONFIDENCE');
      }
      // Precedence Step 4: Policy Default
      else {
        decision = policy.defaultDecision || 'REVIEW';
        decisionScore = decision === 'REDACT' ? 0.8 : decision === 'KEEP' ? 0.2 : 0.5;
        rationaleCodes.push('POLICY_DEFAULT');
      }
    }

    return {
      decision,
      decisionScore: Math.round(decisionScore * 100) / 100,
      matchedRuleIds,
      rationaleCodes,
      evaluationWarnings,
    };
  }

  private static matchesRule(
    candidate: IPIICandidate,
    contextResult: IContextResult | null,
    rule: IPolicyRule
  ): boolean {
    if (!rule.conditions || rule.conditions.length === 0) {
      return false;
    }
    return rule.conditions.every((cond) => this.matchesCondition(candidate, contextResult, cond));
  }

  private static matchesCondition(
    candidate: IPIICandidate,
    contextResult: IContextResult | null,
    cond: IPolicyCondition
  ): boolean {
    const val = this.getPropertyValue(candidate, contextResult, cond.property);

    switch (cond.operator) {
      case 'EQUALS':
        return String(val) === String(cond.value);
      case 'NOT_EQUALS':
        return String(val) !== String(cond.value);
      case 'GREATER_THAN':
        return typeof val === 'number' && val > Number(cond.value);
      case 'GREATER_THAN_OR_EQUAL':
        return typeof val === 'number' && val >= Number(cond.value);
      case 'LESS_THAN':
        return typeof val === 'number' && val < Number(cond.value);
      case 'LESS_THAN_OR_EQUAL':
        return typeof val === 'number' && val <= Number(cond.value);
      case 'IN':
        return Array.isArray(cond.value) && cond.value.includes(val);
      case 'NOT_IN':
        return Array.isArray(cond.value) && !cond.value.includes(val);
      case 'EXISTS':
        return val !== undefined && val !== null;
      default:
        return false;
    }
  }

  private static getPropertyValue(
    candidate: IPIICandidate,
    contextResult: IContextResult | null,
    prop: string
  ): unknown {
    switch (prop) {
      case 'type':
        return candidate.type;
      case 'category':
        return candidate.category;
      case 'detectionScore':
        return candidate.detectionScore;
      case 'sensitivityScore':
        return candidate.sensitivityScore;
      case 'recognitionConfidence':
        return candidate.recognitionConfidence;
      case 'detectorType':
        return candidate.detectorType;
      case 'sourceType':
        return candidate.provenance?.sourceType;
      case 'contextualScore':
        return contextResult ? contextResult.contextualScore : undefined;
      case 'semanticRole':
        return contextResult ? contextResult.semanticRole : undefined;
      case 'fieldLabel':
        return contextResult ? contextResult.fieldLabel : undefined;
      case 'ambiguityIndicators':
        return contextResult ? contextResult.ambiguityIndicators : [];
      case 'isTable':
        return contextResult ? contextResult.structuralContext?.isTable : false;
      case 'isHeaderFooter':
        return contextResult ? contextResult.structuralContext?.isHeaderFooter : false;
      default:
        return undefined;
    }
  }
}
