import { AmbiguityIndicator } from '../../config/contextTaxonomy';
import { IContextSignal } from '../../models/contextResult.model';
import { FieldLabelAnalysisResult } from './fieldLabelAnalyzer';

export interface ContextConflictResult {
  conflictSignals: IContextSignal[];
  ambiguityIndicators: AmbiguityIndicator[];
}

export class ContextConflictDetector {
  public static detectConflicts(
    candidateType: string,
    fieldAnalysis: FieldLabelAnalysisResult,
    _windowText: string
  ): ContextConflictResult {
    const conflictSignals: IContextSignal[] = [];
    const ambiguityIndicators: AmbiguityIndicator[] = [];

    const label = (fieldAnalysis.fieldLabel || '').toLowerCase();

    // 1. Phone number vs Invoice / Order / Reference Number conflict
    if (
      candidateType === 'PHONE_NUMBER' &&
      (label.includes('invoice') ||
        label.includes('order') ||
        label.includes('item') ||
        label.includes('part') ||
        label.includes('sku') ||
        label.includes('ref'))
    ) {
      ambiguityIndicators.push('CONFLICTING_CONTEXT');
      conflictSignals.push({
        signalType: 'NEGATIVE_CONTEXT_SIGNAL',
        weight: 0.5,
        provenance: `Candidate type ${candidateType} conflicts with label '${fieldAnalysis.fieldLabel}'`,
        description: `Phone number pattern found near invoice/order identifier label`,
      });
    }

    // 2. Email Address vs Product / System Code conflict
    if (
      candidateType === 'EMAIL_ADDRESS' &&
      (label.includes('product') || label.includes('system') || label.includes('code'))
    ) {
      ambiguityIndicators.push('CONFLICTING_CONTEXT');
      conflictSignals.push({
        signalType: 'NEGATIVE_CONTEXT_SIGNAL',
        weight: 0.4,
        provenance: `Email address candidate conflicts with label '${fieldAnalysis.fieldLabel}'`,
        description: `Email pattern found in system code field`,
      });
    }

    // 3. Ambiguous label or weak context check
    if (!fieldAnalysis.fieldLabel && fieldAnalysis.negativeSignals.length === 0) {
      ambiguityIndicators.push('WEAK_CONTEXT');
      conflictSignals.push({
        signalType: 'AMBIGUITY_SIGNAL',
        weight: 0.15,
        provenance: `No explicit field label or structural header found`,
        description: `Weak surrounding contextual evidence`,
      });
    }

    // 4. Multiple conflicting labels check
    if (fieldAnalysis.positiveSignals.length > 2) {
      ambiguityIndicators.push('MULTIPLE_SEMANTIC_INTERPRETATIONS');
      conflictSignals.push({
        signalType: 'AMBIGUITY_SIGNAL',
        weight: 0.2,
        provenance: `Multiple positive field label matches found in window`,
        description: `Multiple semantic interpretations detected`,
      });
    }

    return {
      conflictSignals,
      ambiguityIndicators,
    };
  }
}
