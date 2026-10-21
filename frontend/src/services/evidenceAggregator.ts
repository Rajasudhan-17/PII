/**
 * Evidence Aggregator & Decision Pipeline (Frontend Service)
 */

import { DocumentType, DocumentClassifier } from './documentClassifier';

export interface PIICandidateEvidence {
  detector: string;
  score: number;
  reason: string;
}

export interface EnhancedPIICandidate {
  id: string;
  type: string;
  label?: string;
  value?: string;
  confidence: number;
  riskScore: number;
  evidence: PIICandidateEvidence[];
  contextScore: number;
  detectorAgreement: number;
  ocrConfidence?: number;
  documentType?: string;
  decision: 'REDACT' | 'REVIEW' | 'KEEP';
  startOffset: number;
  endOffset: number;
  pageNumber?: number;
  boundingBox?: any;
  places?: number;
}

export interface CandidateInput {
  id?: string;
  type: string;
  label?: string;
  value: string;
  startOffset?: number;
  endOffset?: number;
  pageNumber?: number;
  boundingBox?: any;
  detector: string;
  confidence: number;
  ocrConfidence?: number;
  evidence?: string[];
  reason?: string;
}

export interface RulePolicyConfig {
  detectors?: Record<string, boolean>;
  alwaysRedact?: string[];
  neverRedact?: string[];
  confidenceThreshold?: number;
  documentTypeOverride?: DocumentType;
}

const STRONG_PII_CONTEXT_KEYWORDS = [
  'patient', 'patient name', 'patient id', 'mrn', 'medical record',
  'dob', 'date of birth', 'birth date', 'born on', 'ssn', 'social security',
  'aadhaar', 'uidai', 'pan', 'permanent account number', 'passport',
  'account number', 'policy number', 'member id', 'phone', 'mobile',
  'telephone', 'cell', 'tel', 'mob', 'ph', 'ph.', 'contact', 'call', 'reach',
  'contact number', 'phone number', 'cell number', 'fax',
  'email', 'e-mail', 'address', 'residential address',
  'beneficiary', 'cardholder', 'tax id', 'national id', 'driving license',
  'full name', 'first name', 'last name', 'holder name', 'dear', 'sincerely'
];

const LEGITIMATE_BUSINESS_KEYWORDS = [
  'company', 'corporation', 'inc', 'inc.', 'llc', 'llp', 'limited', 'ltd',
  'gmbh', 'plc', 'department', 'division', 'headquarters', 'job title',
  'position', 'role', 'manager', 'director', 'vice president', 'president',
  'vendor', 'supplier', 'terms and conditions', 'terms of service',
  'privacy policy', 'disclaimer', 'copyright', 'all rights reserved',
  'product code', 'model number', 'invoice number', 'case number', 'matter of',
  'court of', 'plaintiff', 'defendant', 'statutory', 'public notice', 'license agreement'
];

const ORGANIZATION_SUFFIXES = new Set([
  'inc', 'inc.', 'corp', 'corp.', 'corporation', 'llc', 'llp', 'ltd', 'ltd.',
  'limited', 'co.', 'company', 'enterprises', 'solutions', 'holdings',
  'technologies', 'group', 'services', 'bank', 'foundation', 'institute',
  'system', 'systems', 'network', 'healthcare', 'hospital', 'clinic', 'center', 'centre', 'agency'
]);

export class EvidenceAggregator {
  public static normalizeForMatching(text: string): { normalized: string; isModified: boolean } {
    if (!text) return { normalized: '', isModified: false };
    const cleaned = text.replace(/[\u200B-\u200D\uFEFF]/g, ' ');
    return {
      normalized: cleaned,
      isModified: cleaned !== text,
    };
  }

  public static extractContextWindow(fullText: string, start: number, end: number, windowRadius = 150): string {
    if (!fullText) return '';
    const safeStart = Math.max(0, start - windowRadius);
    const safeEnd = Math.min(fullText.length, end + windowRadius);
    return fullText.slice(safeStart, safeEnd);
  }

  public static evaluateContextScore(
    contextWindow: string,
    _candidateType: string,
    candidateValue: string
  ): { score: number; reasons: string[]; isOrgContext: boolean } {
    if (!contextWindow || contextWindow.trim().length === 0) {
      return { score: 0, reasons: ['No surrounding context available.'], isOrgContext: false };
    }

    const lowerWin = contextWindow.toLowerCase();
    const lowerVal = candidateValue.toLowerCase().trim();
    const reasons: string[] = [];
    let piiSignals = 0;
    let businessSignals = 0;

    const valWords = lowerVal.split(/\s+/);
    const lastWord = valWords[valWords.length - 1];
    const isOrgContext = ORGANIZATION_SUFFIXES.has(lastWord);

    if (isOrgContext) {
      businessSignals += 3;
      reasons.push(`Contains corporate entity suffix: "${lastWord.toUpperCase()}"`);
    }

    for (const kw of STRONG_PII_CONTEXT_KEYWORDS) {
      if (lowerWin.includes(kw)) {
        piiSignals += 1.5;
        reasons.push(`Surrounding context contains PII marker: "${kw}"`);
        break;
      }
    }

    for (const bkw of LEGITIMATE_BUSINESS_KEYWORDS) {
      if (lowerWin.includes(bkw) && !lowerVal.includes(bkw)) {
        businessSignals += 1.2;
        reasons.push(`Surrounding context indicates business/corporate terminology: "${bkw}"`);
        break;
      }
    }

    // Contextual non-PII prefix (e.g. "Invoice Number: 20261047", "Billing Reference: INV-2026-88129", "Product Code: ABC12345")
    const nonPiiPrefixMatch = new RegExp(
      `(?:invoice|billing|order|reference|ref|registration|case|matter|ticket|product|model|batch|tracking|sku|equipment|device|hosp)\\s*(?:number|reference|ref|id|code|#)?\\s*[:=-]\\s*(?:[A-Z]{2,6}[-_])?${escapeRegex(candidateValue)}`,
      'i'
    );
    if (nonPiiPrefixMatch.test(contextWindow)) {
      businessSignals += 4.0;
      reasons.push('Candidate immediately preceded by non-PII invoice/product/case label.');
    }

    if (/(?:INV|REF|HOSP|REG|ECG|MOD|CASE|ORD|ITEM|SKU)[-_]/i.test(candidateValue)) {
      businessSignals += 4.0;
      reasons.push('Candidate value contains non-PII transaction/equipment code prefix.');
    }

    const immediatePrefixMatch = new RegExp(
      `(?:name|patient|employee|manager|director|physician|doctor|holder|applicant|signatory|representative|witness|dob|phone|telephone|tel|ph|mobile|mob|cell|fax|contact|email|card|ssn|aadhaar|pan)\\s*[:=-]\\s*${escapeRegex(candidateValue)}`,
      'i'
    );
    if (immediatePrefixMatch.test(contextWindow)) {
      piiSignals += 2.5;
      reasons.push('Candidate immediately preceded by an explicit role/PII label.');
    }

    const rawScore = (piiSignals - businessSignals) / Math.max(1, piiSignals + businessSignals + 1);
    const clampedScore = Math.max(-1, Math.min(1, Math.round(rawScore * 100) / 100));

    return {
      score: clampedScore,
      reasons,
      isOrgContext,
    };
  }

  public static aggregateAndDecide(
    fullText: string,
    rawCandidates: CandidateInput[],
    policyConfig: RulePolicyConfig = {}
  ): EnhancedPIICandidate[] {
    if (!rawCandidates || rawCandidates.length === 0) {
      return [];
    }

    const docClassification = policyConfig.documentTypeOverride
      ? { primaryType: policyConfig.documentTypeOverride, confidence: 1.0, scores: {} as any, matchedKeywords: [] }
      : DocumentClassifier.classify(fullText);
    const documentType = docClassification.primaryType;

    const enrichedInputs: CandidateInput[] = [];
    for (const cand of rawCandidates) {
      let start = cand.startOffset ?? -1;
      let end = cand.endOffset ?? -1;

      if (start === -1 && cand.value && fullText) {
        start = fullText.indexOf(cand.value);
        if (start !== -1) {
          end = start + cand.value.length;
        }
      }

      enrichedInputs.push({
        ...cand,
        startOffset: start !== -1 ? start : 0,
        endOffset: end !== -1 ? end : cand.value.length,
      });
    }

    const mergedCandidates = this.mergeOverlappingCandidates(enrichedInputs);
    const proximityScores = this.computeProximityScores(mergedCandidates);

    const enhancedCandidates: EnhancedPIICandidate[] = [];
    const alwaysRedactSet = new Set((policyConfig.alwaysRedact || []).map((s) => s.trim().toLowerCase()));
    const neverRedactSet = new Set((policyConfig.neverRedact || []).map((s) => s.trim().toLowerCase()));

    for (let i = 0; i < mergedCandidates.length; i++) {
      const cand = mergedCandidates[i];
      const val = cand.value.trim();
      const lowerVal = val.toLowerCase();

      const contextWindow = this.extractContextWindow(fullText, cand.startOffset!, cand.endOffset!);
      const contextEval = this.evaluateContextScore(contextWindow, cand.type, val);

      const evidenceList: PIICandidateEvidence[] = [];

      for (const ev of cand.evidence || []) {
        evidenceList.push({
          detector: cand.detector,
          score: cand.confidence,
          reason: ev,
        });
      }
      if (evidenceList.length === 0) {
        evidenceList.push({
          detector: cand.detector,
          score: cand.confidence,
          reason: cand.reason || `Detected by ${cand.detector}`,
        });
      }

      if (contextEval.reasons.length > 0) {
        for (const r of contextEval.reasons) {
          evidenceList.push({
            detector: 'ContextAnalyzer',
            score: Math.max(0.2, (contextEval.score + 1) / 2),
            reason: r,
          });
        }
      }

      if (documentType !== 'GENERAL') {
        evidenceList.push({
          detector: 'DocumentClassifier',
          score: docClassification.confidence,
          reason: `Document classified as ${documentType} profile (${Math.round(docClassification.confidence * 100)}% confidence).`,
        });
      }

      const prox = proximityScores.get(i) || 0;
      if (prox > 0) {
        evidenceList.push({
          detector: 'ProximityCluster',
          score: 0.85,
          reason: `Found in cluster with ${prox} other PII candidate(s) nearby.`,
        });
      }

      if (cand.ocrConfidence !== undefined && cand.ocrConfidence !== null) {
        evidenceList.push({
          detector: 'OCREngine',
          score: cand.ocrConfidence,
          reason: `OCR character recognition confidence: ${Math.round(cand.ocrConfidence * 100)}%.`,
        });
      }

      const uniqueDetectors = new Set(evidenceList.map((e) => e.detector));
      const detectorAgreement = Math.min(1.0, Math.round((uniqueDetectors.size / 4) * 100) / 100);

      const decisionResult = this.evaluateDetectorPolicy({
        candidate: cand,
        value: val,
        lowerValue: lowerVal,
        documentType,
        contextScore: contextEval.score,
        isOrgContext: contextEval.isOrgContext,
        proximityCount: prox,
        evidenceCount: uniqueDetectors.size,
        alwaysRedactSet,
        neverRedactSet,
      });

      let places = 1;
      if (val.length > 0 && fullText) {
        const esc = escapeRegex(val);
        const startsWithWord = /^\w/.test(val);
        const endsWithWord = /\w$/.test(val);
        const pattern = `${startsWithWord ? '\\b' : ''}${esc}${endsWithWord ? '\\b' : ''}`;
        const matches = fullText.match(new RegExp(pattern, 'gi'));
        places = matches ? Math.max(1, matches.length) : 1;
      }

      enhancedCandidates.push({
        id: cand.id || `cand_${i + 1}_${encodeURIComponent(val).slice(0, 16)}`,
        type: cand.type,
        label: cand.label || cand.type,
        value: val,
        confidence: decisionResult.confidence,
        riskScore: decisionResult.riskScore,
        evidence: evidenceList,
        contextScore: contextEval.score,
        detectorAgreement,
        ocrConfidence: cand.ocrConfidence,
        documentType,
        decision: decisionResult.decision,
        startOffset: cand.startOffset!,
        endOffset: cand.endOffset!,
        pageNumber: cand.pageNumber,
        boundingBox: cand.boundingBox,
        places,
      });
    }

    return enhancedCandidates;
  }

  private static mergeOverlappingCandidates(candidates: CandidateInput[]): CandidateInput[] {
    if (candidates.length <= 1) return candidates;

    const sorted = [...candidates].sort((a, b) => {
      const startA = a.startOffset || 0;
      const startB = b.startOffset || 0;
      if (startA !== startB) return startA - startB;
      const lenA = (a.endOffset || 0) - startA;
      const lenB = (b.endOffset || 0) - startB;
      return lenB - lenA;
    });

    const merged: CandidateInput[] = [];

    for (const curr of sorted) {
      if (merged.length === 0) {
        merged.push({ ...curr, evidence: [...(curr.evidence || [])] });
        continue;
      }

      const prev = merged[merged.length - 1];
      const prevStart = prev.startOffset || 0;
      const prevEnd = prev.endOffset || 0;
      const currStart = curr.startOffset || 0;
      const currEnd = curr.endOffset || 0;

      const isOverlap = currStart < prevEnd && currEnd > prevStart;

      if (isOverlap) {
        const combinedEvidence = new Set([...(prev.evidence || []), ...(curr.evidence || [])]);
        if (curr.reason) combinedEvidence.add(curr.reason);
        if (prev.reason) combinedEvidence.add(prev.reason);

        const pickType = curr.confidence > prev.confidence ? curr.type : prev.type;
        const pickLabel = curr.confidence > prev.confidence ? curr.label : prev.label;
        const pickDetector = `${prev.detector} + ${curr.detector}`;

        prev.endOffset = Math.max(prevEnd, currEnd);
        prev.confidence = Math.max(prev.confidence, curr.confidence);
        prev.type = pickType;
        prev.label = pickLabel;
        prev.detector = pickDetector;
        prev.evidence = Array.from(combinedEvidence);
      } else {
        merged.push({ ...curr, evidence: [...(curr.evidence || [])] });
      }
    }

    return merged;
  }

  private static computeProximityScores(candidates: CandidateInput[]): Map<number, number> {
    const proximityMap = new Map<number, number>();
    const PROXIMITY_WINDOW_CHARS = 300;

    for (let i = 0; i < candidates.length; i++) {
      let neighbors = 0;
      const startI = candidates[i].startOffset || 0;

      for (let j = 0; j < candidates.length; j++) {
        if (i === j) continue;
        const startJ = candidates[j].startOffset || 0;
        if (Math.abs(startI - startJ) <= PROXIMITY_WINDOW_CHARS) {
          neighbors++;
        }
      }
      proximityMap.set(i, neighbors);
    }

    return proximityMap;
  }

  private static evaluateDetectorPolicy(params: {
    candidate: CandidateInput;
    value: string;
    lowerValue: string;
    documentType: DocumentType;
    contextScore: number;
    isOrgContext: boolean;
    proximityCount: number;
    evidenceCount: number;
    alwaysRedactSet: Set<string>;
    neverRedactSet: Set<string>;
  }): { decision: 'REDACT' | 'REVIEW' | 'KEEP'; confidence: number; riskScore: number } {
    const {
      candidate,
      lowerValue,
      documentType,
      contextScore,
      isOrgContext,
      proximityCount,
      evidenceCount: _evidenceCount,
      alwaysRedactSet,
      neverRedactSet,
    } = params;

    const type = candidate.type.toUpperCase();

    // 0. OCR Confidence Safeguard: Low-confidence OCR candidates must go to REVIEW, never auto-redacted
    if (candidate.ocrConfidence !== undefined && candidate.ocrConfidence < 0.85) {
      return { decision: 'REVIEW', confidence: candidate.confidence, riskScore: 0.65 };
    }

    // 1. Never Redact whitelist
    const isHighRiskId = type.includes('CARD') || type.includes('AADHAAR') || type.includes('PAN') || type.includes('SSN');
    if (neverRedactSet.has(lowerValue)) {
      if (!isHighRiskId) {
        return { decision: 'KEEP', confidence: 0.1, riskScore: 0.05 };
      }
    }

    // 2. Always Redact blacklist
    if (alwaysRedactSet.has(lowerValue) || candidate.type === 'CUSTOM_ALWAYS') {
      return { decision: 'REDACT', confidence: 1.0, riskScore: 1.0 };
    }

    // 3. Security credentials & keys
    if (type.includes('API_KEY') || type.includes('TOKEN') || type.includes('PRIVATE_KEY') || type.includes('PASSWORD')) {
      return { decision: 'REDACT', confidence: 0.99, riskScore: 1.0 };
    }

    // 4. Payment Cards
    if (type.includes('CARD')) {
      if (candidate.confidence >= 0.95) {
        return { decision: 'REDACT', confidence: 0.99, riskScore: 0.95 };
      }
      if (contextScore > 0 || proximityCount > 0) {
        return { decision: 'REVIEW', confidence: 0.75, riskScore: 0.8 };
      }
      return { decision: 'KEEP', confidence: 0.3, riskScore: 0.4 };
    }

    // 5. Government IDs
    if (type.includes('AADHAAR') || type.includes('PAN') || type.includes('SSN')) {
      if (candidate.confidence >= 0.9) {
        if (contextScore >= -0.2) {
          return { decision: 'REDACT', confidence: 0.96, riskScore: 0.95 };
        }
        return { decision: 'REVIEW', confidence: 0.8, riskScore: 0.85 };
      }
      return { decision: 'REVIEW', confidence: 0.65, riskScore: 0.7 };
    }

    // 6. IBAN
    if (type.includes('IBAN')) {
      if (candidate.confidence >= 0.95) {
        return { decision: 'REDACT', confidence: 0.99, riskScore: 0.9 };
      }
      return { decision: 'REVIEW', confidence: 0.7, riskScore: 0.75 };
    }

    // 7. Email
    if (type.includes('EMAIL')) {
      const isSupportEmail = /^(support|sales|info|contact|help|billing|marketing|careers|press)@/i.test(lowerValue);
      if (isSupportEmail && isOrgContext) {
        return { decision: 'KEEP', confidence: 0.4, riskScore: 0.2 };
      }
      return { decision: 'REDACT', confidence: 0.98, riskScore: 0.85 };
    }

    // 8. Phone
    if (type.includes('PHONE')) {
      if (contextScore < -0.2) {
        return { decision: 'KEEP', confidence: 0.2, riskScore: 0.1 };
      }
      if (contextScore < 0) {
        return { decision: 'REVIEW', confidence: 0.65, riskScore: 0.6 };
      }
      // Valid phone number without negative business context -> REDACT
      return { decision: 'REDACT', confidence: Math.max(0.92, candidate.confidence), riskScore: 0.85 };
    }

    // 9. Person Names
    if (type.includes('NAME') || type.includes('PERSON')) {
      if (isOrgContext || contextScore < -0.3) {
        return { decision: 'KEEP', confidence: 0.2, riskScore: 0.1 };
      }
      if (contextScore > 0.1 || proximityCount > 0 || ['MEDICAL', 'HR', 'LEGAL'].includes(documentType)) {
        return { decision: 'REDACT', confidence: 0.94, riskScore: 0.88 };
      }
      if (contextScore >= 0) {
        return { decision: 'REVIEW', confidence: 0.65, riskScore: 0.6 };
      }
      return { decision: 'KEEP', confidence: 0.35, riskScore: 0.25 };
    }

    // 10. DOB
    if (type.includes('BIRTH') || type.includes('DOB')) {
      if (contextScore > 0 || documentType === 'MEDICAL' || documentType === 'HR') {
        return { decision: 'REDACT', confidence: 0.95, riskScore: 0.85 };
      }
      return { decision: 'REVIEW', confidence: 0.75, riskScore: 0.7 };
    }

    // 11. Addresses
    if (type.includes('ADDRESS')) {
      if (contextScore > 0 || proximityCount > 0) {
        return { decision: 'REDACT', confidence: 0.88, riskScore: 0.8 };
      }
      return { decision: 'REVIEW', confidence: 0.65, riskScore: 0.6 };
    }

    if (candidate.confidence >= 0.85 && contextScore >= 0) {
      return { decision: 'REDACT', confidence: candidate.confidence, riskScore: 0.75 };
    }
    return { decision: 'REVIEW', confidence: Math.max(0.5, candidate.confidence), riskScore: 0.5 };
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}
