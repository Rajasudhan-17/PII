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

          // If identical candidate range and type, skip candidate
          if (cand.type === acc.type && cand.startOffset === acc.startOffset && cand.endOffset === acc.endOffset) {
            break;
          }

          // If cand is DETERMINISTIC and acc is HEURISTIC/NER_MODEL, replace acc
          if (cand.detectorType === 'DETERMINISTIC' && acc.detectorType !== 'DETERMINISTIC') {
            accepted[i] = cand;
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
