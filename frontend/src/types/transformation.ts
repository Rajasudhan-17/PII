export type OutputArtifactStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PENDING_REVIEW';

export interface OutputArtifact {
  outputArtifactId: string;
  organizationId: string;
  sourceDocumentId: string;
  transformationRunId: string;
  sourceChecksum: string;
  outputChecksum: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  status: OutputArtifactStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TransformationRecord {
  transformationRecordId?: string;
  candidateId: string;
  operation: string;
  originalText?: string;
  transformedText?: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  location?: {
    startOffset: number;
    endOffset: number;
    pageNumber?: number;
    blockId?: string;
  };
}

export interface TransformationRun {
  transformationRunId: string;
  documentId: string;
  organizationId: string;
  decisionRunId?: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
  operation?: string;
  totalCandidatesEvaluated?: number;
  redactedCount?: number;
  maskedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  failureReason?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface TransformationArtifactsResponse {
  success: boolean;
  data: {
    transformationRun: TransformationRun | null;
    outputArtifact: OutputArtifact | null;
    records?: TransformationRecord[];
  };
}

export interface TransformationRunsResponse {
  success: boolean;
  data: {
    transformationRuns?: TransformationRun[];
    runs?: TransformationRun[];
  };
}
