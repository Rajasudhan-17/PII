import { BoundingBox } from '../../models/normalizedDocument.model';

export type MediaModalityType = 'AUDIO' | 'VIDEO';

export type MediaProviderType =
  | 'OFFLINE_SYNTHETIC_FIXTURE'
  | 'EXTERNAL_PRODUCTION_ASR'
  | 'UNCONFIGURED';

export type MediaProcessingStatus =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED'
  | 'NOT_VERIFIABLE'
  | 'UNSUPPORTED';

export interface AudioTranscriptWord {
  word: string;
  startMs: number;
  endMs: number;
  confidence?: number | null;
}

export interface AudioTranscriptSegment {
  segmentId: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerTag?: string | null;
  confidence?: number | null;
  words?: AudioTranscriptWord[];
}

export interface AudioTranscriptionResult {
  status: MediaProcessingStatus;
  durationSeconds: number;
  language?: string | null;
  segments: AudioTranscriptSegment[];
  rawTranscriptText: string;
  isTranscribed: boolean;
  providerType: MediaProviderType;
  isSyntheticFixture: boolean;
  unverifiableReason?: string | null;
  warnings: Array<{ code: string; message: string }>;
}

export interface VideoFrameMetadata {
  frameNumber: number;
  timestampMs: number;
  extractedWidth?: number;
  extractedHeight?: number;
  detectedTextBlocks?: Array<{
    text: string;
    boundingBox?: BoundingBox;
    confidence?: number | null;
  }>;
}

export interface VideoExtractionResult {
  status: MediaProcessingStatus;
  durationSeconds: number;
  totalFrameCount: number;
  inspectedFrameCount: number;
  frames: VideoFrameMetadata[];
  audioTranscription?: AudioTranscriptionResult | null;
  isFullyInspected: boolean;
  isSyntheticFixture: boolean;
  providerType?: MediaProviderType;
  unverifiableReason?: string | null;
  warnings: Array<{ code: string; message: string }>;
}

export interface MediaPIICandidate {
  candidateId: string;
  modality: MediaModalityType;
  entityType: string;
  rawText: string;
  confidence: number | null; // Nullable: confidence is never invented if not provided by underlying engine
  startMs?: number;
  endMs?: number;
  startOffset?: number;
  endOffset?: number;
  frameNumber?: number;
  boundingBox?: BoundingBox;
  provenanceRef: string;
}

export interface MediaProcessingResult {
  documentId: string;
  organizationId: string;
  modality: MediaModalityType;
  status: MediaProcessingStatus;
  overallScore?: number;
  candidates: MediaPIICandidate[];
  audioResult?: AudioTranscriptionResult;
  videoResult?: VideoExtractionResult;
  providerType: MediaProviderType;
  isSyntheticFixture: boolean;
  processingTimeMs: number;
  coverageStatus: 'FULL_COVERAGE' | 'PARTIAL_COVERAGE' | 'INCOMPLETE_COVERAGE' | 'UNVERIFIABLE';
  reasons: string[];
}
