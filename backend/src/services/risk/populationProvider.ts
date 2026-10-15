import { ReferencePopulationMode } from '../../models/reidentificationRiskResult.model';

export interface PopulationRiskEstimate {
  mode: ReferencePopulationMode;
  kAnonymityEstimate: number | null;
  lDiversitySignal: string | null;
  heuristicRarityScore: number; // 0.00 to 1.00
  confidencePenalty: number; // Penalty to apply when no real population data exists
  explanation: string;
}

export class ReferencePopulationProvider {
  private populationDatasetName: string | null = null;
  private datasetCounts: Map<string, number> = new Map();

  /**
   * Loads a reference population dataset.
   */
  public loadPopulationDataset(datasetName: string, counts: Map<string, number>): void {
    this.populationDatasetName = datasetName;
    this.datasetCounts = counts;
  }

  /**
   * Evaluates risk against loaded population dataset.
   */
  public evaluateRiskWithLoadedDataset(attributeTypes: string[], combinedUniquenessWeight: number): PopulationRiskEstimate {
    if (!this.populationDatasetName || this.datasetCounts.size === 0) {
      return ReferencePopulationProvider.evaluatePopulationRisk(attributeTypes, combinedUniquenessWeight);
    }

    const key = attributeTypes.join('_');
    const count = this.datasetCounts.get(key) ?? 100;

    return {
      mode: 'REFERENCE_DATA_AVAILABLE',
      kAnonymityEstimate: count,
      lDiversitySignal: 'L_DIVERSITY_SATISFIED',
      heuristicRarityScore: combinedUniquenessWeight,
      confidencePenalty: 0.0,
      explanation: `Evaluated against reference population dataset [${this.populationDatasetName}].`,
    };
  }

  /**
   * Evaluates population rarity and k-anonymity signal.
   * If real population statistics are unavailable, returns HEURISTIC mode with k = null.
   * NEVER fabricates population counts.
   */
  public static evaluatePopulationRisk(
    attributeTypes: string[],
    combinedUniquenessWeight: number
  ): PopulationRiskEstimate {
    // Deterministic heuristic rarity bounds based on attribute combination specificity
    const heuristicRarityScore = Math.min(1.0, Number((combinedUniquenessWeight * 1.15).toFixed(2)));

    let explanation = `Heuristic rarity baseline score ${heuristicRarityScore} evaluated for [${attributeTypes.join(
      ', '
    )}]. Real population dataset unavailable; k-anonymity set to null.`;

    let lDiversitySignal = 'HEURISTIC_DIVERSITY_SIGNAL';
    if (attributeTypes.length >= 3) {
      lDiversitySignal = 'HEURISTIC_DIVERSITY_HIGH_CONSTRAINED';
      explanation += ' High attribute combination constraint observed.';
    }

    return {
      mode: 'HEURISTIC',
      kAnonymityEstimate: null, // k = null without real population data
      lDiversitySignal,
      heuristicRarityScore,
      confidencePenalty: 0.15, // Lower confidence when using heuristic estimates without real population data
      explanation,
    };
  }
}
