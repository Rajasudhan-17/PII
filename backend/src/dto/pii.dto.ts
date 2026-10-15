import { PIIType, PIICategory, PIISeverity } from '../config/piiTaxonomy';
import { BoundingBox } from '../models/normalizedDocument.model';
import { DetectorType, PIISourceType } from '../models/piiCandidate.model';
import { DetectionRunStatus } from '../models/detectionRun.model';

export interface TriggerPIIDetectionRequestDto {
  async?: boolean;
  force?: boolean;
}

export interface DetectionRunDto {
  detectionRunId: string;
  documentId: string;
  organizationId: string;
  documentChecksum: string;
  normalizedDocumentVersion: string;
  detectorConfigurationHash: string;
  status: DetectionRunStatus;
  isLatestActive: boolean;
  candidateCount: number;
  warnings: Array<{ code: string; message: string }>;
  startedAt: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
}

export interface PIICandidateDto {
  candidateId: string;
  detectionRunId: string;
  documentId: string;
  organizationId: string;
  type: PIIType;
  category: PIICategory;
  text: string;
  normalizedValue: string;
  confidence: number;
  recognitionConfidence: number | null;
  detectionScore: number;
  severity: PIISeverity;
  sensitivityScore: number;
  evidence: string[];
  detectorName: string;
  detectorType: DetectorType;
  decision: null; // STRICT INVARIANT: Always null in Phase 07
  isMasked: boolean;
  isRedacted: boolean;
  location: {
    startOffset: number;
    endOffset: number;
    pageNumber?: number;
    blockId?: string;
    boundingBox?: BoundingBox | null;
  };
  provenance: {
    sourceType: PIISourceType;
    blockId: string;
    extractorVersion?: string;
  };
  createdAt: Date;
}

export interface PIIDetectionResponseDto {
  success: boolean;
  data: {
    documentId: string;
    organizationId: string;
    detectionRunId: string;
    runStatus: DetectionRunStatus;
    totalCandidates: number;
    candidates: PIICandidateDto[];
  };
}

export interface PIIDetectionSummaryResponseDto {
  success: boolean;
  data: {
    documentId: string;
    organizationId: string;
    detectionRunId: string | null;
    status: string;
    totalCandidates: number;
    maxSensitivityScore: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    byPage: Record<string, number>;
  };
}
