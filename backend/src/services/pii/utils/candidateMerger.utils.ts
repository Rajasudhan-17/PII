import { RawDetectedCandidate } from '../detectors/detector.interface';

export function mergeCandidates(
  candidates: RawDetectedCandidate[]
): RawDetectedCandidate[] {
  if (candidates.length <= 1) return candidates;

  // Group candidates by blockId
  const blockGroups = new Map<string, RawDetectedCandidate[]>();
  for (const cand of candidates) {
    const key = cand.blockId || 'FULL_TEXT';
    if (!blockGroups.has(key)) {
      blockGroups.set(key, []);
    }
    blockGroups.get(key)!.push(cand);
  }

  const mergedResults: RawDetectedCandidate[] = [];

  for (const group of blockGroups.values()) {
    // Sort candidates:
    // 1. DETERMINISTIC detectors over HEURISTIC / NER_MODEL
    // 2. Higher detectionScore first
    // 3. Longer character range first
    group.sort((a, b) => {
      const typeRank = (t: string) => (t === 'DETERMINISTIC' ? 2 : 1);
      const rankDiff = typeRank(b.detectorType) - typeRank(a.detectorType);
      if (rankDiff !== 0) return rankDiff;

      const scoreDiff = b.detectionScore - a.detectionScore;
      if (Math.abs(scoreDiff) > 0.001) return scoreDiff;

      const lenA = a.endOffset - a.startOffset;
      const lenB = b.endOffset - b.startOffset;
      return lenB - lenA;
    });

    const accepted: RawDetectedCandidate[] = [];

    for (const cand of group) {
      let isOverlap = false;

      for (let i = 0; i < accepted.length; i++) {
        const acc = accepted[i];
        // Candidates overlap ONLY if character spans intersect within the block
        const overlap = cand.startOffset < acc.endOffset && cand.endOffset > acc.startOffset;

        if (overlap) {
          isOverlap = true;

          // Union evidence rather than discarding
          const mergedEvidence = Array.from(
            new Set([...(acc.evidence || []), ...(cand.evidence || []), `Corroborated by ${cand.detectorName}`])
          );

          // If cand is DETERMINISTIC and acc is HEURISTIC/NER_MODEL, replace acc properties but keep accumulated evidence
          if (cand.detectorType === 'DETERMINISTIC' && acc.detectorType !== 'DETERMINISTIC') {
            accepted[i] = {
              ...cand,
              evidence: mergedEvidence,
              detectorName: `${cand.detectorName} + ${acc.detectorName}`,
            };
          } else {
            // Retain acc, but augment with cand evidence and higher score if applicable
            accepted[i].evidence = mergedEvidence;
            if (cand.detectionScore > accepted[i].detectionScore) {
              accepted[i].detectionScore = cand.detectionScore;
              accepted[i].confidence = cand.confidence;
            }
          }
          break;
        }
      }

      if (!isOverlap) {
        // Distinct occurrence at unique location - preserve candidate!
        accepted.push(cand);
      }
    }

    mergedResults.push(...accepted);
  }

  return mergedResults;
}
