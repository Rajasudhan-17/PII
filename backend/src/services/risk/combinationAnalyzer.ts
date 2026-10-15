import { classifyAttribute } from './quasiIdentifier.taxonomy';

export interface CombinationAnalysisResult {
  combinationRiskScore: number;
  evaluatedCombinationCount: number;
  topCombinationAttributes: string[];
  geographicRiskScore: number;
  temporalRiskScore: number;
  linkageRiskScore: number;
  uniquenessRiskScore: number;
  explanation: string;
}

export interface UpstreamRelationshipEvidence {
  relationType: string;
  sourceType: string;
  targetType: string;
  confidence?: number;
}

export class CombinationAnalyzer {
  /**
   * Bounded combination evaluation (max 4-way combinations) to prevent combinatorial explosion.
   */
  public static analyzeCombinations(
    attributeTypes: string[],
    relationships: UpstreamRelationshipEvidence[] = []
  ): CombinationAnalysisResult {
    const uniqueTypes = Array.from(new Set(attributeTypes.map((t) => t.toUpperCase().replace(/\s+/g, '_'))));
    const MAX_COMBINATION_DEPTH = 4;
    const MAX_EVALUATED_ATTRIBUTES = 30;
    const boundedTypes = uniqueTypes.slice(0, MAX_EVALUATED_ATTRIBUTES);

    let maxCombinationScore = 0.0;
    let evaluatedCount = 0;
    let topAttributes: string[] = [];

    // 1. Single Attribute Uniqueness
    const singleScores = boundedTypes.map((t) => {
      const def = classifyAttribute(t);
      return { type: t, weight: def.baseUniquenessWeight, category: def.category };
    });

    for (const s of singleScores) {
      evaluatedCount++;
      if (s.weight > maxCombinationScore) {
        maxCombinationScore = s.weight;
        topAttributes = [s.type];
      }
    }

    // 2. 2-Way Combinations: Non-linear interaction score (S1 + S2 - S1*S2) + boost
    for (let i = 0; i < boundedTypes.length && MAX_COMBINATION_DEPTH >= 2; i++) {
      for (let j = i + 1; j < boundedTypes.length; j++) {
        evaluatedCount++;
        const w1 = singleScores[i].weight;
        const w2 = singleScores[j].weight;
        const combScore = Math.min(1.0, w1 + w2 - w1 * w2 + 0.15);

        if (combScore > maxCombinationScore) {
          maxCombinationScore = combScore;
          topAttributes = [boundedTypes[i], boundedTypes[j]];
        }
      }
    }

    // 3. 3-Way & 4-Way Bounded Combinations
    if (boundedTypes.length >= 3 && MAX_COMBINATION_DEPTH >= 3) {
      for (let i = 0; i < Math.min(boundedTypes.length, 10); i++) {
        for (let j = i + 1; j < Math.min(boundedTypes.length, 10); j++) {
          for (let k = j + 1; k < Math.min(boundedTypes.length, 10); k++) {
            evaluatedCount++;
            const w1 = singleScores[i].weight;
            const w2 = singleScores[j].weight;
            const w3 = singleScores[k].weight;
            const combScore = Math.min(1.0, 1.0 - (1.0 - w1) * (1.0 - w2) * (1.0 - w3) + 0.25);

            if (combScore > maxCombinationScore) {
              maxCombinationScore = combScore;
              topAttributes = [boundedTypes[i], boundedTypes[j], boundedTypes[k]];
            }

            // 4-Way Combination if 4+ attributes
            if (boundedTypes.length >= 4 && MAX_COMBINATION_DEPTH >= 4) {
              for (let l = k + 1; l < Math.min(boundedTypes.length, 8); l++) {
                evaluatedCount++;
                const w4 = singleScores[l].weight;
                const combScore4 = Math.min(1.0, 1.0 - (1.0 - w1) * (1.0 - w2) * (1.0 - w3) * (1.0 - w4) + 0.35);

                if (combScore4 > maxCombinationScore) {
                  maxCombinationScore = combScore4;
                  topAttributes = [boundedTypes[i], boundedTypes[j], boundedTypes[k], boundedTypes[l]];
                }
              }
            }
          }
        }
      }
    }

    // 4. Geographic Precision Risk
    let geographicRiskScore = 0.0;
    const geoTypes = singleScores.filter((s) => s.category === 'GEOGRAPHIC');
    for (const g of geoTypes) {
      if (g.type === 'GPS_COORDINATE') geographicRiskScore = Math.max(geographicRiskScore, 0.95);
      else if (g.type === 'STREET_ADDRESS') geographicRiskScore = Math.max(geographicRiskScore, 0.85);
      else if (g.type === 'POSTAL_CODE') geographicRiskScore = Math.max(geographicRiskScore, 0.60);
      else if (g.type === 'DISTRICT' || g.type === 'NEIGHBORHOOD') geographicRiskScore = Math.max(geographicRiskScore, 0.50);
      else if (g.type === 'CITY') geographicRiskScore = Math.max(geographicRiskScore, 0.30);
      else if (g.type === 'STATE') geographicRiskScore = Math.max(geographicRiskScore, 0.15);
      else if (g.type === 'COUNTRY') geographicRiskScore = Math.max(geographicRiskScore, 0.05);
      else geographicRiskScore = Math.max(geographicRiskScore, 0.25);
    }

    // 5. Temporal Precision Risk
    let temporalRiskScore = 0.0;
    const tempTypes = singleScores.filter((s) => s.category === 'TEMPORAL');
    for (const t of tempTypes) {
      if (t.type === 'TIMESTAMP') temporalRiskScore = Math.max(temporalRiskScore, 0.85);
      else if (t.type === 'DATE' || t.type === 'EVENT_DATE' || t.type === 'DATE_OF_BIRTH')
        temporalRiskScore = Math.max(temporalRiskScore, 0.55);
      else if (t.type === 'MONTH') temporalRiskScore = Math.max(temporalRiskScore, 0.25);
      else if (t.type === 'YEAR') temporalRiskScore = Math.max(temporalRiskScore, 0.10);
      else temporalRiskScore = Math.max(temporalRiskScore, 0.30);
    }

    // 6. Linkage Risk (from Upstream Phase 08 Relationships)
    let linkageRiskScore = 0.0;
    if (relationships && relationships.length > 0) {
      for (const rel of relationships) {
        const type = rel.relationType ? rel.relationType.toUpperCase() : '';
        if (type.includes('PERSON_NAME_EMAIL') || type.includes('PERSON_SSN')) linkageRiskScore = Math.max(linkageRiskScore, 0.90);
        else if (type.includes('PERSON_EMPLOYER') || type.includes('PERSON_INSTITUTION')) linkageRiskScore = Math.max(linkageRiskScore, 0.70);
        else if (type.includes('PERSON_LOCATION') || type.includes('PERSON_ORGANIZATION')) linkageRiskScore = Math.max(linkageRiskScore, 0.55);
        else linkageRiskScore = Math.max(linkageRiskScore, 0.40);
      }
    }

    const uniquenessRiskScore = Number(maxCombinationScore.toFixed(2));
    const combinationRiskScore = Number(maxCombinationScore.toFixed(2));
    geographicRiskScore = Number(geographicRiskScore.toFixed(2));
    temporalRiskScore = Number(temporalRiskScore.toFixed(2));
    linkageRiskScore = Number(linkageRiskScore.toFixed(2));

    const explanation = `Evaluated ${evaluatedCount} attribute combinations. Highest risk combination: [${topAttributes.join(
      ' + '
    )}] with combination score ${combinationRiskScore}.`;

    return {
      combinationRiskScore,
      evaluatedCombinationCount: evaluatedCount,
      topCombinationAttributes: topAttributes,
      geographicRiskScore,
      temporalRiskScore,
      linkageRiskScore,
      uniquenessRiskScore,
      explanation,
    };
  }
}
