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
   */
  public static evaluateCorpus(corpus: SyntheticDocumentRecord[]): BenchmarkReport {
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

    for (const doc of corpus) {
      const docTypeKey = doc.documentType;
      if (!docTypeStats[docTypeKey]) docTypeStats[docTypeKey] = initStats();

      // Extract raw candidates using baseline detectors
      const rawCandidates = this.extractRawCandidates(doc.text);
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
    const a = typeA.toUpperCase();
    const b = typeB.toUpperCase();
    if (a === b) return true;
    if ((a.includes('NAME') || a.includes('PERSON')) && (b.includes('NAME') || b.includes('PERSON'))) return true;
    if ((a.includes('BIRTH') || a.includes('DOB')) && (b.includes('BIRTH') || b.includes('DOB'))) return true;
    if (a.includes('ADDRESS') && b.includes('ADDRESS')) return true;
    if (a.includes('PHONE') && b.includes('PHONE')) return true;
    if (a.includes('EMAIL') && b.includes('EMAIL')) return true;
    if (a.includes('CARD') && b.includes('CARD')) return true;
    if (a.includes('SSN') && b.includes('SSN')) return true;
    if (a.includes('PAN') && b.includes('PAN')) return true;
    if (a.includes('AADHAAR') && b.includes('AADHAAR')) return true;
    if (a.includes('IBAN') && b.includes('IBAN')) return true;
    if (a.includes('API_KEY') && b.includes('API_KEY')) return true;
    return false;
  }

  private static extractRawCandidates(text: string): CandidateInput[] {
    const candidates: CandidateInput[] = [];

    // 1. Emails
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    let m: RegExpExecArray | null;
    while ((m = emailRegex.exec(text)) !== null) {
      candidates.push({
        type: 'EMAIL_ADDRESS',
        label: 'EMAIL',
        value: m[0],
        startOffset: m.index,
        endOffset: m.index + m[0].length,
        detector: 'EmailRegex',
        confidence: 0.99,
        reason: 'RFC-5322 email syntax.',
      });
    }

    // 2. Phones
    const phoneRegex = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}\b|\b[6-9]\d{9}\b/g;
    while ((m = phoneRegex.exec(text)) !== null) {
      const val = m[0].trim();
      const digits = val.replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 15) {
        candidates.push({
          type: 'PHONE_NUMBER',
          label: 'PHONE',
          value: val,
          startOffset: m.index,
          endOffset: m.index + val.length,
          detector: 'PhoneRegex',
          confidence: 0.95,
          reason: 'E.164 phone number pattern.',
        });
      }
    }

    // 3. Credit Cards (Luhn algorithm)
    const cardRegex = /\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{13,19}\b/g;
    while ((m = cardRegex.exec(text)) !== null) {
      const val = m[0].trim();
      const clean = val.replace(/\D/g, '');
      let isLuhn = false;
      if (clean.length >= 13 && clean.length <= 19) {
        let sum = 0;
        let dbl = false;
        for (let i = clean.length - 1; i >= 0; i--) {
          let d = parseInt(clean.charAt(i), 10);
          if (dbl) {
            d *= 2;
            if (d > 9) d -= 9;
          }
          sum += d;
          dbl = !dbl;
        }
        isLuhn = sum % 10 === 0;
      }
      candidates.push({
        type: 'CREDIT_CARD',
        label: 'CARD',
        value: val,
        startOffset: m.index,
        endOffset: m.index + val.length,
        detector: isLuhn ? 'CreditCardLuhn' : 'CardPattern',
        confidence: isLuhn ? 0.99 : 0.6,
        reason: isLuhn ? 'Luhn checksum verified.' : 'Format match without Luhn.',
      });
    }

    // 4. PAN
    const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
    while ((m = panRegex.exec(text)) !== null) {
      candidates.push({
        type: 'PAN_NUMBER',
        label: 'PAN',
        value: m[0],
        startOffset: m.index,
        endOffset: m.index + m[0].length,
        detector: 'PANDirect',
        confidence: 0.96,
        reason: 'Income Tax PAN format.',
      });
    }

    // 5. Aadhaar
    const aadhaarRegex = /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;
    while ((m = aadhaarRegex.exec(text)) !== null) {
      candidates.push({
        type: 'AADHAAR_NUMBER',
        label: 'AADHAAR',
        value: m[0],
        startOffset: m.index,
        endOffset: m.index + m[0].length,
        detector: 'AadhaarRegex',
        confidence: 0.98,
        reason: '12-digit UIDAI format.',
      });
    }

    // 6. IBAN
    const ibanRegex = /\b[A-Z]{2}\d{2}(?:\s?[A-Za-z0-9]{4}){2,7}(?:\s?[A-Za-z0-9]{1,4})?\b/g;
    while ((m = ibanRegex.exec(text)) !== null) {
      candidates.push({
        type: 'IBAN_NUMBER',
        label: 'IBAN',
        value: m[0],
        startOffset: m.index,
        endOffset: m.index + m[0].length,
        detector: 'IBANRegex',
        confidence: 0.99,
        reason: 'ISO 13616 IBAN format.',
      });
    }

    // 7. SSN
    const ssnRegex = /\b\d{3}[ -]\d{2}[ -]\d{4}\b/g;
    while ((m = ssnRegex.exec(text)) !== null) {
      candidates.push({
        type: 'US_SSN',
        label: 'SSN',
        value: m[0],
        startOffset: m.index,
        endOffset: m.index + m[0].length,
        detector: 'SSNRegex',
        confidence: 0.95,
        reason: 'SSA 9-digit format.',
      });
    }

    // 8. API Key
    const keyRegex = /\bAKIA[0-9A-Z]{16}\b/g;
    while ((m = keyRegex.exec(text)) !== null) {
      candidates.push({
        type: 'API_KEY',
        label: 'API KEY',
        value: m[0],
        startOffset: m.index,
        endOffset: m.index + m[0].length,
        detector: 'APIKeyRegex',
        confidence: 1.0,
        reason: 'AWS Access Key ID format.',
      });
    }

    // 9. DOB
    const dobRegex = /(?:DOB|Date of birth|Birth Date|Born)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/gi;
    while ((m = dobRegex.exec(text)) !== null) {
      const val = m[1];
      const offset = m[0].indexOf(val);
      candidates.push({
        type: 'DATE_OF_BIRTH',
        label: 'BIRTH',
        value: val,
        startOffset: m.index + offset,
        endOffset: m.index + offset + val.length,
        detector: 'DOBContextRegex',
        confidence: 0.95,
        reason: 'Date preceded by DOB context.',
      });
    }

    // 10. Address
    const addrRegex = /\b\d{1,5}\s+[A-Za-z0-9\s,.-]+(?:Road|Street|Avenue|Drive|Way|Bangalore|Mumbai|Kolkata)\b/gi;
    while ((m = addrRegex.exec(text)) !== null) {
      candidates.push({
        type: 'STREET_ADDRESS',
        label: 'ADDRESS',
        value: m[0],
        startOffset: m.index,
        endOffset: m.index + m[0].length,
        detector: 'AddressRegex',
        confidence: 0.85,
        reason: 'Street entity with geographic location.',
      });
    }

    // 11. Contextual Person Names
    const nameRegex = /(?:Patient Name|Employee Name|Account Holder|Customer Name|Authorized Representative|Attending Physician|Reporting Manager|Dr\.|Mr\.)[:\s]+(?:(?:Dr\.|Mr\.|Mrs\.|Ms\.)\s+)?([A-Z][a-z]+(?:[^\S\r\n]+[A-Z][a-z]+)+)/g;
    while ((m = nameRegex.exec(text)) !== null) {
      const rawVal = m[1].trim();
      const val = rawVal.replace(/^(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s+/i, '');
      const offset = m[0].lastIndexOf(val);
      candidates.push({
        type: 'PERSON_NAME',
        label: 'NAME',
        value: val,
        startOffset: m.index + offset,
        endOffset: m.index + offset + val.length,
        detector: 'ContextualNameRegex',
        confidence: 0.92,
        reason: 'Person name preceded by formal role marker.',
      });
    }

    return candidates;
  }
}
