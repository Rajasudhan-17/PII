import { RawDetectedCandidate } from '../detectors/detector.interface';
import { PIIType } from '../../../config/piiTaxonomy';

const STRONGER_IDENTIFIER_TYPES = new Set([
  PIIType.CREDIT_CARD_NUMBER,
  PIIType.IBAN,
  PIIType.US_SSN,
  PIIType.INDIAN_AADHAAR,
  PIIType.INDIAN_PAN,
]);

/**
 * Suppresses PHONE_NUMBER candidates that are fully contained within or heavily
 * overlap with stronger deterministic candidates (Credit Card, IBAN, SSN, Aadhaar, PAN).
 * Standalone phone numbers remain preserved.
 */
export function suppressContainedPhoneCandidates(
  candidates: RawDetectedCandidate[]
): RawDetectedCandidate[] {
  if (candidates.length <= 1) return candidates;

  const strongerCandidates = candidates.filter((c) => STRONGER_IDENTIFIER_TYPES.has(c.type));
  if (strongerCandidates.length === 0) {
    return candidates;
  }

  return candidates.filter((cand) => {
    if (cand.type !== PIIType.PHONE_NUMBER) {
      return true;
    }

    for (const stronger of strongerCandidates) {
      // Contained within stronger candidate's span (with 2 char whitespace tolerance)
      const isContained =
        cand.startOffset >= stronger.startOffset - 2 &&
        cand.endOffset <= stronger.endOffset + 2;

      if (isContained) {
        return false;
      }

      // Or significant fractional overlap (>= 70% of phone candidate is covered by stronger candidate)
      const overlapStart = Math.max(cand.startOffset, stronger.startOffset);
      const overlapEnd = Math.min(cand.endOffset, stronger.endOffset);
      const overlapLen = Math.max(0, overlapEnd - overlapStart);
      const phoneLen = Math.max(1, cand.endOffset - cand.startOffset);

      if (overlapLen / phoneLen >= 0.7) {
        return false;
      }
    }

    return true;
  });
}

export function mergeCandidates(
  candidates: RawDetectedCandidate[]
): RawDetectedCandidate[] {
  if (candidates.length <= 1) return candidates;

  // Suppress overlapping phone candidates contained within stronger identifiers
  const preFiltered = suppressContainedPhoneCandidates(candidates);

  // Group candidates by blockId
  const blockGroups = new Map<string, RawDetectedCandidate[]>();
  for (const cand of preFiltered) {
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
