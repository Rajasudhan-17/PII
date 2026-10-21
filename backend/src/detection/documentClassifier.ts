/**
 * Document Type Classifier
 *
 * Classifies extracted document text into domain profiles:
 * - MEDICAL
 * - FINANCIAL
 * - LEGAL
 * - HR
 * - IDENTITY
 * - CUSTOMER_SUPPORT
 * - GENERAL (fallback default)
 *
 * Document classification dynamically adjusts prior weights and context expectations
 * in the Evidence Aggregator without acting as a single point of failure.
 */

export type DocumentType =
  | 'GENERAL'
  | 'MEDICAL'
  | 'FINANCIAL'
  | 'LEGAL'
  | 'HR'
  | 'IDENTITY'
  | 'CUSTOMER_SUPPORT';

export interface DocumentClassificationResult {
  primaryType: DocumentType;
  confidence: number;
  scores: Record<DocumentType, number>;
  matchedKeywords: string[];
}

const PROFILE_KEYWORDS: Record<Exclude<DocumentType, 'GENERAL'>, string[]> = {
  MEDICAL: [
    'patient', 'diagnosis', 'medical record', 'mrn', 'physician', 'hospital',
    'clinic', 'prescription', 'symptoms', 'treatment', 'pathology', 'radiology',
    'health insurance', 'dosage', 'doctor', 'clinical', 'laboratory', 'admission',
    'discharge summary', 'consultant', 'vital signs', 'blood pressure'
  ],
  FINANCIAL: [
    'invoice', 'account number', 'bank', 'iban', 'swift', 'bic', 'credit card',
    'debit card', 'transaction', 'payment', 'balance', 'statement', 'remittance',
    'tax invoice', 'billing', 'routing number', 'ifsc', 'cvv', 'ledger', 'audit',
    'financial statement', 'net payable', 'amount due'
  ],
  LEGAL: [
    'agreement', 'contract', 'party', 'plaintiff', 'defendant', 'clause',
    'court', 'jurisdiction', 'arbitration', 'indemnity', 'witnesseth',
    'whereas', 'liability', 'confidentiality', 'intellectual property',
    'terms and conditions', 'signatory', 'notary', 'in witness whereof'
  ],
  HR: [
    'employment', 'offer letter', 'salary', 'designation', 'department',
    'joining date', 'employee id', 'probation', 'payroll', 'compensation',
    'human resources', 'appraisal', 'performance', 'resignation', 'termination',
    'benefits', 'annual leave', 'reporting manager', 'head of people'
  ],
  IDENTITY: [
    'passport', 'aadhaar', 'pan card', 'national id', 'driver license',
    'social security', 'ssn', 'uidai', 'identity card', 'citizenship',
    'birth certificate', 'voter id', 'date of birth', 'place of birth'
  ],
  CUSTOMER_SUPPORT: [
    'ticket', 'customer support', 'case number', 'support request', 'helpdesk',
    'query', 'complaint', 'customer service', 'service request', 'incident',
    'resolution', 'escalation', 'troubleshoot', 'user feedback'
  ],
};

export class DocumentClassifier {
  public static classify(text: string): DocumentClassificationResult {
    const scores: Record<DocumentType, number> = {
      GENERAL: 0.1,
      MEDICAL: 0,
      FINANCIAL: 0,
      LEGAL: 0,
      HR: 0,
      IDENTITY: 0,
      CUSTOMER_SUPPORT: 0,
    };

    if (!text || text.trim().length === 0) {
      return {
        primaryType: 'GENERAL',
        confidence: 0.5,
        scores,
        matchedKeywords: [],
      };
    }

    const lowerText = text.toLowerCase();
    const matchedKeywords: string[] = [];

    for (const [typeKey, keywords] of Object.entries(PROFILE_KEYWORDS)) {
      const docType = typeKey as Exclude<DocumentType, 'GENERAL'>;
      let typeScore = 0;

      for (const kw of keywords) {
        // Look for whole keyword matches
        if (lowerText.includes(kw)) {
          const regex = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
          const count = (lowerText.match(regex) || []).length;
          if (count > 0) {
            typeScore += Math.min(count, 5); // Cap keyword frequency impact
            matchedKeywords.push(kw);
          }
        }
      }

      scores[docType] = typeScore;
    }

    // Determine highest scoring profile
    let bestType: DocumentType = 'GENERAL';
    let highestScore = 0;

    for (const [type, score] of Object.entries(scores)) {
      if (type !== 'GENERAL' && score > highestScore) {
        highestScore = score;
        bestType = type as DocumentType;
      }
    }

    // If highest score is insufficient, fall back to GENERAL
    if (highestScore < 3) {
      return {
        primaryType: 'GENERAL',
        confidence: 0.6,
        scores,
        matchedKeywords,
      };
    }

    const confidence = Math.min(0.99, Math.round((highestScore / (highestScore + 5)) * 100) / 100);

    return {
      primaryType: bestType,
      confidence,
      scores,
      matchedKeywords,
    };
  }
}
