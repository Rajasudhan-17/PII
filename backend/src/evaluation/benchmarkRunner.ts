/**
 * Precision, Recall & F1 Accuracy Benchmark Runner
 *
 * Evaluates detection performance against gold-standard synthetic ground truth:
 * - True Positives (TP): Ground truth PII correctly detected and marked for REDACT / REVIEW
 * - False Negatives (FN): Ground truth PII silently missed or incorrectly marked KEEP
 * - False Positives (FP): Non-PII business text incorrectly marked for REDACT
 *
 * Definitions:
 * Precision = TP / (TP + FP)
 * Recall    = TP / (TP + FN)
 * F1 Score  = 2 * Precision * Recall / (Precision + Recall)
 */

import { EvidenceAggregator, CandidateInput } from '../detection/evidenceAggregator';
import { DocumentType } from '../detection/documentClassifier';
import { initializeDefaultDetectors, IPIIDetector, RawDetectedCandidate } from '../services/pii/detectors';
import { mergeCandidates } from '../services/pii/utils/candidateMerger.utils';

export interface GroundTruthEntity {
  type: string;
  text: string;
  page?: number;
}

export interface SyntheticDocumentRecord {
  document: string;
  documentType: DocumentType;
  text: string;
  entities: GroundTruthEntity[];
}

export interface BenchmarkScore {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
  fnr: number;
}

export interface BenchmarkReport {
  overall: BenchmarkScore;
  byDetector: Record<string, BenchmarkScore>;
  byDocumentType: Record<string, BenchmarkScore>;
  totalGroundTruthEntities: number;
  totalDetectedCandidates: number;
  timestamp: string;
  fpExamples: Array<{ document: string; candidate: string; type: string; reason: string }>;
  fnExamples: Array<{ document: string; expected: string; type: string; reason?: string }>;
}

export class BenchmarkRunner {
  /**
   * Runs the complete accuracy benchmark on a corpus of ground-truth annotated documents
   * using the REAL production registered detector implementations.
   */
  public static async evaluateCorpus(corpus: SyntheticDocumentRecord[]): Promise<BenchmarkReport> {
    let globalTP = 0;
    let globalFP = 0;
    let globalFN = 0;
    let totalDetected = 0;
    let totalExpected = 0;

    const detectorStats: Record<string, { tp: number; fp: number; fn: number }> = {};
    const docTypeStats: Record<string, { tp: number; fp: number; fn: number }> = {};
    const fpExamples: Array<{ document: string; candidate: string; type: string; reason: string }> = [];
    const fnExamples: Array<{ document: string; expected: string; type: string; reason?: string }> = [];

    const initStats = () => ({ tp: 0, fp: 0, fn: 0 });

    const registry = initializeDefaultDetectors();
    const detectors = registry.getAllDetectors();

    for (const doc of corpus) {
      const docTypeKey = doc.documentType;
      if (!docTypeStats[docTypeKey]) docTypeStats[docTypeKey] = initStats();

      // Extract raw candidates using real production registered detectors
      const rawCandidates = await this.extractRawCandidates(doc.text, detectors);
      totalDetected += rawCandidates.length;

      // Run Evidence Aggregator pipeline
      const aggregated = EvidenceAggregator.aggregateAndDecide(doc.text, rawCandidates, {
        documentTypeOverride: doc.documentType,
      });

      // Track matched ground truth entities to detect False Negatives
      const matchedExpectedIndices = new Set<number>();
      totalExpected += doc.entities.length;

      // Evaluate detected candidates that were marked for REDACT or REVIEW
      for (const cand of aggregated) {
        const candType = cand.type;
        if (!detectorStats[candType]) detectorStats[candType] = initStats();

        // Check if candidate matches any expected ground truth entity
        let matchedIdx = -1;
        for (let i = 0; i < doc.entities.length; i++) {
          if (matchedExpectedIndices.has(i)) continue;
          const exp = doc.entities[i];

          const isTypeMatch = this.typesCompatible(cand.type, exp.type);
          const isValueMatch =
            cand.value?.toLowerCase().trim() === exp.text.toLowerCase().trim() ||
            (cand.value && exp.text && (cand.value.includes(exp.text) || exp.text.includes(cand.value)));

          if (isTypeMatch && isValueMatch) {
            matchedIdx = i;
            break;
          }
        }

        if (matchedIdx !== -1) {
          // Candidate corresponds to true PII
          if (cand.decision === 'REDACT' || cand.decision === 'REVIEW') {
            globalTP++;
            detectorStats[candType].tp++;
            docTypeStats[docTypeKey].tp++;
            matchedExpectedIndices.add(matchedIdx);
          } else {
            // Silently kept PII is a False Negative
            globalFN++;
            detectorStats[candType].fn++;
            docTypeStats[docTypeKey].fn++;
            matchedExpectedIndices.add(matchedIdx);
            fnExamples.push({
              document: doc.document,
              expected: doc.entities[matchedIdx].text,
              type: doc.entities[matchedIdx].type,
              reason: 'Classified as KEEP instead of REDACT or REVIEW',
            });
          }
        } else {
          // Candidate does not correspond to expected PII
          if (cand.decision === 'REDACT') {
            // Over-redaction of non-PII is a False Positive
            globalFP++;
            detectorStats[candType].fp++;
            docTypeStats[docTypeKey].fp++;
            fpExamples.push({
              document: doc.document,
              candidate: cand.value || '',
              type: cand.type,
              reason: cand.evidence?.[0]?.reason || 'Incorrectly classified for auto-redaction',
            });
          }
          // Note: if decision is 'KEEP' or non-redacted, it's a correct rejection
        }
      }

      // Any ground truth entity that was never detected is a False Negative
      for (let i = 0; i < doc.entities.length; i++) {
        if (!matchedExpectedIndices.has(i)) {
          globalFN++;
          const expType = doc.entities[i].type;
          if (!detectorStats[expType]) detectorStats[expType] = initStats();
          detectorStats[expType].fn++;
          docTypeStats[docTypeKey].fn++;
          fnExamples.push({
            document: doc.document,
            expected: doc.entities[i].text,
            type: expType,
            reason: 'Undetected by baseline detectors',
          });
        }
      }
    }

    const calcScore = (s: { tp: number; fp: number; fn: number }): BenchmarkScore => {
      const precision = s.tp + s.fp > 0 ? s.tp / (s.tp + s.fp) : 1.0;
      const recall = s.tp + s.fn > 0 ? s.tp / (s.tp + s.fn) : 1.0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      const fpr = s.tp + s.fp > 0 ? s.fp / (s.tp + s.fp) : 0;
      const fnr = s.tp + s.fn > 0 ? s.fn / (s.tp + s.fn) : 0;

      return {
        tp: s.tp,
        fp: s.fp,
        fn: s.fn,
        precision: Math.round(precision * 1000) / 10,
        recall: Math.round(recall * 1000) / 10,
        f1: Math.round(f1 * 1000) / 10,
        fpr: Math.round(fpr * 1000) / 10,
        fnr: Math.round(fnr * 1000) / 10,
      };
    };

    const byDetector: Record<string, BenchmarkScore> = {};
    for (const [k, v] of Object.entries(detectorStats)) {
      byDetector[k] = calcScore(v);
    }

    const byDocumentType: Record<string, BenchmarkScore> = {};
    for (const [k, v] of Object.entries(docTypeStats)) {
      byDocumentType[k] = calcScore(v);
    }

    return {
      overall: calcScore({ tp: globalTP, fp: globalFP, fn: globalFN }),
      byDetector,
      byDocumentType,
      totalGroundTruthEntities: totalExpected,
      totalDetectedCandidates: totalDetected,
      timestamp: new Date().toISOString(),
      fpExamples,
      fnExamples,
    };
  }

  private static typesCompatible(typeA: string, typeB: string): boolean {
    const normA = typeA.toUpperCase().replace(/[- ]/g, '_');
    const normB = typeB.toUpperCase().replace(/[- ]/g, '_');
    if (normA === normB) return true;
    if ((normA.includes('NAME') || normA.includes('PERSON')) && (normB.includes('NAME') || normB.includes('PERSON'))) return true;
    if ((normA.includes('BIRTH') || normA.includes('DOB')) && (normB.includes('BIRTH') || normB.includes('DOB'))) return true;
    if ((normA.includes('ADDRESS') || normA.includes('LOCATION') || normA.includes('CITY')) && (normB.includes('ADDRESS') || normB.includes('LOCATION') || normB.includes('CITY'))) return true;
    if (normA.includes('PHONE') && normB.includes('PHONE')) return true;
    if (normA.includes('EMAIL') && normB.includes('EMAIL')) return true;
    if (normA.includes('CARD') && normB.includes('CARD')) return true;
    if (normA.includes('SSN') && normB.includes('SSN')) return true;
    if (normA.includes('PAN') && normB.includes('PAN')) return true;
    if (normA.includes('AADHAAR') && normB.includes('AADHAAR')) return true;
    if (normA.includes('IBAN') && normB.includes('IBAN')) return true;
    if ((normA.includes('API_KEY') || normA.includes('AUTH_TOKEN')) && (normB.includes('API_KEY') || normB.includes('AUTH_TOKEN'))) return true;
    if (normA.includes('PASSPORT') && normB.includes('PASSPORT')) return true;
    if ((normA.includes('DRIVING_LICENSE') || normA.includes('DL')) && (normB.includes('DRIVING_LICENSE') || normB.includes('DL'))) return true;
    return false;
  }

  private static async extractRawCandidates(
    text: string,
    detectors: IPIIDetector[]
  ): Promise<CandidateInput[]> {
    const rawDetected: RawDetectedCandidate[] = [];
    for (const detector of detectors) {
      const results = await detector.detect(text, {
        documentId: 'benchmark_doc',
        organizationId: 'benchmark_org',
        fullText: text,
      });
      rawDetected.push(...results);
    }

    const merged = mergeCandidates(rawDetected);

    return merged.map((cand) => ({
      type: cand.type,
      label: cand.type,
      value: cand.text,
      startOffset: cand.startOffset,
      endOffset: cand.endOffset,
      detector: cand.detectorName,
      confidence: cand.confidence,
      reason: cand.evidence?.join(', ') || 'Production detector match',
    }));
  }
}
