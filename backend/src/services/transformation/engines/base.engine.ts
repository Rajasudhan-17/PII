import { IPIICandidate, IPIICandidateLocation } from '../../../models/piiCandidate.model';
import { IDecisionResult } from '../../../models/decisionResult.model';
import { MutationGenerator } from '../mutationGenerator';

export interface TransformationEngineOptions {
  operation: 'REDACTION' | 'MUTATION';
  candidates: IPIICandidate[];
  decisions: Map<string, IDecisionResult>;
  mutationGenerator: MutationGenerator;
  sourceFilePath: string;
  outputFilePath: string;
}

export interface EngineTransformationResult {
  transformedCount: number;
  skippedCount: number;
  failedCount: number;
  warnings: Array<{ code: string; message: string }>;
  appliedRecords: Array<{
    candidateId: string;
    occurrenceId: string;
    decision: 'KEEP' | 'REVIEW' | 'REDACT';
    operation: 'REDACT' | 'MUTATE' | 'SKIP_KEEP' | 'SKIP_REVIEW';
    status: 'APPLIED' | 'SKIPPED' | 'FAILED';
    location: IPIICandidateLocation | Record<string, unknown>;
    syntheticValue?: string;
    failureReason?: string;
  }>;
}

export interface ITransformationEngine {
  transform(options: TransformationEngineOptions): Promise<EngineTransformationResult>;
}
