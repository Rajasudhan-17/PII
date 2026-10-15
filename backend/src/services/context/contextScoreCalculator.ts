import { IContextSignal, IRelationshipEvidence } from '../../models/contextResult.model';
import { AmbiguityIndicator } from '../../config/contextTaxonomy';

export class ContextScoreCalculator {
  public static calculateScore(
    positiveSignals: IContextSignal[],
    negativeSignals: IContextSignal[],
    structuralSignals: IContextSignal[],
    conflictSignals: IContextSignal[],
    relationships: IRelationshipEvidence[],
    ambiguityIndicators: AmbiguityIndicator[]
  ): number {
    let score = 0.5; // Neutral base score

    // 1. Add positive field label signals
    for (const sig of positiveSignals) {
      score += sig.weight;
    }

    // 2. Add structural placement support
    for (const sig of structuralSignals) {
      score += sig.weight;
    }

    // 3. Add relationship evidence support
    const supportedRels = relationships.filter((r) => r.status === 'SUPPORTED');
    if (supportedRels.length > 0) {
      score += Math.min(0.2, supportedRels.length * 0.1);
    }

    // 4. Subtract negative context signals
    for (const sig of negativeSignals) {
      score -= sig.weight;
    }

    // 5. Subtract conflict signals
    for (const sig of conflictSignals) {
      score -= sig.weight;
    }

    // 6. Subtract ambiguity penalties
    if (ambiguityIndicators.includes('WEAK_CONTEXT')) {
      score -= 0.1;
    }
    if (ambiguityIndicators.includes('CONFLICTING_CONTEXT')) {
      score -= 0.25;
    }
    if (ambiguityIndicators.includes('AMBIGUOUS_LABEL')) {
      score -= 0.15;
    }

    // Bound to [0.0, 1.0] and round to 2 decimal places
    const finalScore = Math.max(0, Math.min(1, score));
    return Math.round(finalScore * 100) / 100;
  }
}
