export type PIIType =
  | 'PERSON_NAME'
  | 'EMAIL_ADDRESS'
  | 'PHONE_NUMBER'
  | 'US_SSN'
  | 'CREDIT_CARD_NUMBER'
  | 'IBAN_CODE'
  | 'NATIONAL_ID'
  | 'STREET_ADDRESS'
  | 'CITY'
  | 'STATE'
  | 'POSTAL_CODE'
  | 'DATE_OF_BIRTH'
  | 'IP_ADDRESS'
  | 'MAC_ADDRESS'
  | 'AUTH_TOKEN_KEY'
  | 'SECURITY_CREDENTIAL'
  | 'API_KEY'
  | 'GENERIC_IDENTIFIER'
  | string;

export type DetectorType = 'DETERMINISTIC' | 'PATTERN' | 'NER_MODEL' | 'HEURISTIC' | 'CONTEXTUAL';
export type PIISourceType = 'NATIVE_TEXT' | 'PRINT_OCR' | 'HANDWRITING_HTR' | 'GENERIC_OCR_FALLBACK';
export type PIISeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PIICandidateLocation {
  startOffset: number;
  endOffset: number;
  pageNumber?: number;
  blockId?: string;
  boundingBox?: BoundingBox | null;
}

export interface PIICandidateProvenance {
  sourceType: PIISourceType;
  blockId: string;
  extractorVersion?: string;
}

export interface PIICandidateItem {
  _id?: string;
  candidateId: string;
  detectionRunId: string;
  documentId: string;
  organizationId: string;
  type: string;
  category: string;
  text: string;
  normalizedValue?: string;
  confidence: number;
  detectionScore: number;
  recognitionConfidence?: number | null;
  severity: PIISeverity;
  sensitivityScore?: number;
  evidence: string[];
  detectorName: string;
  detectorType: DetectorType;
  decision?: string | null;
  isMasked?: boolean;
  isRedacted?: boolean;
  location: PIICandidateLocation;
  provenance: PIICandidateProvenance;
  detectionStatus: 'DETECTED' | 'FAILED' | 'SKIPPED';
  createdAt?: string;
  updatedAt?: string;
}

// Backward compatibility alias
export type PIICandidate = PIICandidateItem;

export interface PIIDetectionRun {
  detectionRunId: string;
  documentId: string;
  organizationId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  totalCandidates: number;
  typesDetected?: string[];
  executedAt?: string;
  createdAt?: string;
}

export interface PIIDetectionResponse {
  success: boolean;
  data: {
    documentId: string;
    organizationId: string;
    detectionRunId?: string;
    runStatus?: string;
    totalCandidates: number;
    candidates: PIICandidateItem[];
  };
}

export interface PIIDetectionSummaryResponse {
  success: boolean;
  data: {
    documentId: string;
    organizationId: string;
    totalCandidates: number;
    categories: Record<string, number>;
    highestConfidence: number;
    detectionRunId?: string;
  };
}
