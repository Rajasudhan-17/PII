import { DecisionType, IPolicyRule } from '../config/policyTaxonomy';

export interface CreatePolicyDTO {
  name: string;
  description?: string;
  defaultDecision?: DecisionType;
  rules?: IPolicyRule[];
}

export interface CreatePolicyVersionDTO {
  name?: string;
  description?: string;
  defaultDecision?: DecisionType;
  rules: IPolicyRule[];
}

export interface EvaluateDecisionsDTO {
  policyId?: string;
  policyVersion?: number;
  force?: boolean;
}
