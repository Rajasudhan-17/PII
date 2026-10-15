import { IPIICandidate } from '../../models/piiCandidate.model';
import { INormalizedDocument } from '../../models/normalizedDocument.model';
import { IContextResult } from '../../models/contextResult.model';
import { ContextWindowExtractor } from './contextWindowExtractor';
import { FieldLabelAnalyzer } from './fieldLabelAnalyzer';
import { StructuralContextAnalyzer } from './structuralContextAnalyzer';
import { ContextConflictDetector } from './contextConflictDetector';
import { RelationshipDetector } from './relationshipDetector';
import { ContextScoreCalculator } from './contextScoreCalculator';
import crypto from 'crypto';

export interface IContextAnalyzer {
  analyzeCandidateContext(
    candidate: IPIICandidate,
    normalizedDoc: INormalizedDocument,
    allCandidates: IPIICandidate[],
    contextAnalysisRunId: string
  ): IContextResult;
}

export class LocalContextAnalyzer implements IContextAnalyzer {
  public static ANALYZER_VERSION = '1.0.0';

  public analyzeCandidateContext(
    candidate: IPIICandidate,
    normalizedDoc: INormalizedDocument,
    allCandidates: IPIICandidate[],
    contextAnalysisRunId: string
  ): IContextResult {
    // 1. Extract bounded context window
    const windowExtracted = ContextWindowExtractor.extractWindow(candidate, normalizedDoc);

    // 2. Analyze structural placement (table, header/footer, spreadsheet, heading section)
    const structuralRes = StructuralContextAnalyzer.analyze(
      candidate,
      normalizedDoc,
      windowExtracted.targetBlock
    );

    // 3. Analyze field labels & positive/negative signals
    const fieldRes = FieldLabelAnalyzer.analyze(
      windowExtracted.windowText,
      candidate.type,
      structuralRes.structuralContext.columnHeader
    );

    // 4. Detect conflicts & ambiguity
    const conflictRes = ContextConflictDetector.detectConflicts(
      candidate.type,
      fieldRes,
      windowExtracted.windowText
    );

    // 5. Detect entity relationships
    const relationships = RelationshipDetector.detectRelationships(candidate, allCandidates);

    // 6. Combine all signals
    const allSignals = [
      ...fieldRes.positiveSignals,
      ...structuralRes.structuralSignals,
      ...fieldRes.negativeSignals,
      ...conflictRes.conflictSignals,
    ];

    // 7. Calculate contextual score
    const contextualScore = ContextScoreCalculator.calculateScore(
      fieldRes.positiveSignals,
      fieldRes.negativeSignals,
      structuralRes.structuralSignals,
      conflictRes.conflictSignals,
      relationships,
      conflictRes.ambiguityIndicators
    );

    // 8. Script / Language detection heuristic (Latin, Devanagari, Tamil)
    const script = this.detectScript(windowExtracted.windowText);
    const language = this.detectLanguage(windowExtracted.windowText);

    // Construct Result Record (STRICT INVARIANT: decision === null)
    const resultObj: Partial<IContextResult> = {
      contextResultId: `cx_res_${crypto.randomUUID()}`,
      contextAnalysisRunId,
      candidateId: candidate.candidateId,
      documentId: candidate.documentId,
      organizationId: candidate.organizationId,
      contextWindow: windowExtracted.metadata,
      semanticRole: fieldRes.detectedRole,
      documentSection: structuralRes.documentSection,
      fieldLabel: fieldRes.fieldLabel,
      nearbyKeywords: fieldRes.nearbyKeywords,
      structuralContext: structuralRes.structuralContext,
      relationshipEvidence: relationships,
      contextSignals: allSignals,
      contextualScore,
      ambiguityIndicators: conflictRes.ambiguityIndicators,
      language,
      script,
      contextWarnings: [],
      analyzerVersion: LocalContextAnalyzer.ANALYZER_VERSION,
      decision: null, // STRICT INVARIANT
    };

    return resultObj as IContextResult;
  }

  private detectScript(text: string): string {
    if (/[\u0900-\u097F]/.test(text)) return 'Devanagari';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'Tamil';
    if (/[a-zA-Z]/.test(text)) return 'Latin';
    return 'Mixed';
  }

  private detectLanguage(text: string): string {
    if (/[\u0900-\u097F]/.test(text)) return 'hi';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
    return 'en';
  }
}
