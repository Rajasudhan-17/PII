import crypto from 'crypto';
import {
  VideoExtractionResult,
  VideoFrameMetadata,
  MediaPIICandidate,
  MediaProcessingResult,
  MediaProviderType,
} from './mediaTypes';
import { AudioProcessingEngine } from './audioEngine';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

export interface VideoEngineOptions {
  maxDurationSeconds?: number;
  maxFrameCount?: number;
  sampleFps?: number; // Sample rate, e.g., 1 frame per second
  audioEngine?: AudioProcessingEngine;
}

export interface VideoFrameExtractor {
  isSyntheticFixture?: boolean;
  providerType?: MediaProviderType;
  extractFrames(videoFilePath: string, options: { maxFrames: number; sampleFps: number }): Promise<{
    durationSeconds: number;
    totalFrameCount: number;
    extractedFrames: Array<{
      frameNumber: number;
      timestampMs: number;
      width: number;
      height: number;
      ocrTextBlocks?: Array<{ text: string; confidence?: number | null; x: number; y: number; width: number; height: number }>;
    }>;
  }>;
}

/**
 * Deterministic local/mock video frame extractor for offline execution and tests.
 */
export class OfflineDeterministicVideoExtractor implements VideoFrameExtractor {
  public readonly isSyntheticFixture: boolean = true;
  public readonly providerType: MediaProviderType = 'OFFLINE_SYNTHETIC_FIXTURE';
  private customFixture?: {
    durationSeconds: number;
    totalFrameCount: number;
    extractedFrames: Array<{
      frameNumber: number;
      timestampMs: number;
      width: number;
      height: number;
      ocrTextBlocks?: Array<{ text: string; confidence?: number | null; x: number; y: number; width: number; height: number }>;
    }>;
  };

  constructor(fixture?: OfflineDeterministicVideoExtractor['customFixture']) {
    this.customFixture = fixture;
  }

  public async extractFrames(_videoFilePath: string): Promise<{
    durationSeconds: number;
    totalFrameCount: number;
    extractedFrames: Array<{
      frameNumber: number;
      timestampMs: number;
      width: number;
      height: number;
      ocrTextBlocks?: Array<{ text: string; confidence?: number | null; x: number; y: number; width: number; height: number }>;
    }>;
  }> {
    if (this.customFixture) {
      return this.customFixture;
    }

    // Default mock frames for test fixtures
    return {
      durationSeconds: 10,
      totalFrameCount: 300,
      extractedFrames: [
        {
          frameNumber: 1,
          timestampMs: 1000,
          width: 1920,
          height: 1080,
          ocrTextBlocks: [
            {
              text: 'Confidential Client: John Doe',
              confidence: 0.94,
              x: 100,
              y: 100,
              width: 400,
              height: 50,
            },
          ],
        },
        {
          frameNumber: 2,
          timestampMs: 2000,
          width: 1920,
          height: 1080,
          ocrTextBlocks: [
            // Identical candidate text in consecutive frame (for deduplication testing)
            {
              text: 'Confidential Client: John Doe',
              confidence: 0.95,
              x: 100,
              y: 100,
              width: 400,
              height: 50,
            },
            {
              text: 'Account ID: 9876-5432-1098',
              confidence: 0.91,
              x: 100,
              y: 180,
              width: 350,
              height: 40,
            },
          ],
        },
      ],
    };
  }
}

export class VideoProcessingEngine {
  private maxDurationSeconds: number;
  private maxFrameCount: number;
  private sampleFps: number;
  private frameExtractor: VideoFrameExtractor;
  private audioEngine?: AudioProcessingEngine;

  constructor(options?: VideoEngineOptions, frameExtractor?: VideoFrameExtractor) {
    this.maxDurationSeconds = options?.maxDurationSeconds ?? 3600; // 1 hour max
    this.maxFrameCount = options?.maxFrameCount ?? 300; // 300 frames max
    this.sampleFps = options?.sampleFps ?? 1;
    this.frameExtractor = frameExtractor ?? new OfflineDeterministicVideoExtractor();
    this.audioEngine = options?.audioEngine;
  }

  /**
   * Processes video frames and embedded audio track, identifying PII candidates with deduplication.
   */
  public async processVideo(params: {
    videoFilePath: string;
    documentId: string;
    organizationId: string;
    knownDurationSeconds?: number;
    processAudioTrack?: boolean;
  }): Promise<MediaProcessingResult> {
    const startTime = Date.now();
    const { videoFilePath, documentId, organizationId, knownDurationSeconds, processAudioTrack = true } = params;

    logger.info(
      { event: 'video_processing_begin', documentId, organizationId },
      `Beginning video processing for document ${documentId}`
    );

    // 1. Resource Governance: Duration Limit
    const estimatedDuration = knownDurationSeconds ?? 10;
    if (estimatedDuration > this.maxDurationSeconds) {
      throw new AppError(
        `Video duration (${estimatedDuration}s) exceeds maximum allowed limit of ${this.maxDurationSeconds}s.`,
        400,
        'RESOURCE_LIMIT_EXCEEDED'
      );
    }

    // 2. Extract Bounded Frames
    let extractionData: {
      durationSeconds: number;
      totalFrameCount: number;
      extractedFrames: Array<{
        frameNumber: number;
        timestampMs: number;
        width: number;
        height: number;
        ocrTextBlocks?: Array<{ text: string; confidence?: number | null; x: number; y: number; width: number; height: number }>;
      }>;
    };

    // Determine provider provenance
    const isSyntheticFixture =
      this.frameExtractor.isSyntheticFixture !== undefined
        ? this.frameExtractor.isSyntheticFixture
        : this.frameExtractor instanceof OfflineDeterministicVideoExtractor;
    const providerType: MediaProviderType =
      this.frameExtractor.providerType ||
      (isSyntheticFixture ? 'OFFLINE_SYNTHETIC_FIXTURE' : 'UNCONFIGURED');

    try {
      extractionData = await this.frameExtractor.extractFrames(videoFilePath, {
        maxFrames: this.maxFrameCount,
        sampleFps: this.sampleFps,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'video_extraction_failed', error: errMsg, documentId }, 'Video frame extraction failed.');
      return {
        documentId,
        organizationId,
        modality: 'VIDEO',
        status: 'FAILED',
        candidates: [],
        coverageStatus: 'UNVERIFIABLE',
        providerType,
        isSyntheticFixture,
        reasons: [`FRAME_EXTRACTION_FAILED: ${errMsg}`],
        processingTimeMs: Date.now() - startTime,
        videoResult: {
          status: 'FAILED',
          durationSeconds: estimatedDuration,
          totalFrameCount: 0,
          inspectedFrameCount: 0,
          frames: [],
          isFullyInspected: false,
          isSyntheticFixture,
          providerType,
          unverifiableReason: 'FRAME_EXTRACTION_FAILED',
          warnings: [{ code: 'FRAME_EXTRACTION_FAILED', message: errMsg }],
        },
      };
    }

    // 3. Resource Governance: Guard frame count bounds
    if (extractionData.extractedFrames.length > this.maxFrameCount) {
      throw new AppError(
        `Extracted frame count (${extractionData.extractedFrames.length}) exceeds maximum limit of ${this.maxFrameCount}.`,
        400,
        'RESOURCE_LIMIT_EXCEEDED'
      );
    }

    // 4. Transform Frame Metadata & OCR
    const frames: VideoFrameMetadata[] = [];
    const rawFrameCandidates: MediaPIICandidate[] = [];

    for (const frame of extractionData.extractedFrames) {
      const frameMeta: VideoFrameMetadata = {
        frameNumber: frame.frameNumber,
        timestampMs: frame.timestampMs,
        extractedWidth: frame.width,
        extractedHeight: frame.height,
        detectedTextBlocks: frame.ocrTextBlocks?.map((b) => ({
          text: b.text,
          confidence: b.confidence !== undefined ? b.confidence : null,
          boundingBox: { x: b.x, y: b.y, width: b.width, height: b.height },
        })),
      };
      frames.push(frameMeta);

      if (frame.ocrTextBlocks) {
        for (const block of frame.ocrTextBlocks) {
          const detected = this.detectPIIInFrameText(
            block.text,
            frame.frameNumber,
            frame.timestampMs,
            documentId,
            {
              x: block.x,
              y: block.y,
              width: block.width,
              height: block.height,
            },
            block.confidence !== undefined ? block.confidence : null
          );
          rawFrameCandidates.push(...detected);
        }
      }
    }

    // 5. Deduplicate candidates across adjacent frames
    const deduplicatedCandidates = this.deduplicateAdjacentFrameCandidates(rawFrameCandidates);

    // 6. Optional Audio Track Processing
    let audioTranscriptionResult = null;
    let audioCandidates: MediaPIICandidate[] = [];
    if (processAudioTrack && this.audioEngine) {
      try {
        const audioRes = await this.audioEngine.processAudio({
          audioFilePath: videoFilePath, // or extracted audio track
          documentId,
          organizationId,
          knownDurationSeconds: extractionData.durationSeconds || estimatedDuration,
        });
        audioTranscriptionResult = audioRes.audioResult || null;
        audioCandidates = audioRes.candidates || [];
      } catch (audioErr: unknown) {
        logger.warn(
          { event: 'video_audio_track_warning', error: (audioErr as Error).message },
          'Audio track processing on video encountered error; continuing with frame OCR.'
        );
      }
    }

    const allCandidates = [...deduplicatedCandidates, ...audioCandidates];

    // 7. Modality Safety Rule: Check completeness of coverage
    // If fewer frames were inspected than existed in the video, flag as PARTIAL coverage
    const isFullyInspected = frames.length >= Math.min(extractionData.totalFrameCount, this.maxFrameCount);
    const coverageStatus = isFullyInspected ? 'FULL_COVERAGE' : 'PARTIAL_COVERAGE';

    const videoResult: VideoExtractionResult = {
      status: 'SUCCESS',
      durationSeconds: extractionData.durationSeconds,
      totalFrameCount: extractionData.totalFrameCount,
      inspectedFrameCount: frames.length,
      frames,
      audioTranscription: audioTranscriptionResult,
      isFullyInspected,
      isSyntheticFixture,
      providerType,
      warnings: isFullyInspected
        ? []
        : [
            {
              code: 'PARTIAL_FRAME_COVERAGE',
              message: `Sampled ${frames.length} frames out of ${extractionData.totalFrameCount} total video frames.`,
            },
          ],
    };

    logger.info(
      {
        event: 'video_processing_completed',
        documentId,
        framesCount: frames.length,
        candidateCount: allCandidates.length,
        coverageStatus,
        providerType,
        isSyntheticFixture,
      },
      `Completed video processing: ${frames.length} frames, ${allCandidates.length} deduplicated candidates`
    );

    return {
      documentId,
      organizationId,
      modality: 'VIDEO',
      status: 'SUCCESS',
      candidates: allCandidates,
      videoResult,
      providerType,
      isSyntheticFixture,
      coverageStatus,
      reasons: [],
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Scans text detected inside a video frame for PII.
   * Safety invariant: Candidate confidence strictly reflects the underlying engine's reported confidence
   * (or null if not provided); never invents or fabricates confidence numbers.
   */
  private detectPIIInFrameText(
    text: string,
    frameNumber: number,
    timestampMs: number,
    documentId: string,
    boundingBox: { x: number; y: number; width: number; height: number },
    blockConfidence?: number | null
  ): MediaPIICandidate[] {
    const candidates: MediaPIICandidate[] = [];
    const confidence = blockConfidence !== undefined ? blockConfidence : null;

    const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
    const NAME_PATTERNS = [
      /\b(?:Client|Patient|User|Customer|Name):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
      /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g,
    ];

    let match: RegExpExecArray | null;
    while ((match = EMAIL_REGEX.exec(text)) !== null) {
      candidates.push({
        candidateId: `vid_pii_${crypto.randomUUID().slice(0, 8)}`,
        modality: 'VIDEO',
        entityType: 'EMAIL_ADDRESS',
        rawText: match[0],
        confidence,
        frameNumber,
        startMs: timestampMs,
        endMs: timestampMs + 1000,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        boundingBox,
        provenanceRef: `media:video:doc:${documentId}:frame:${frameNumber}:time:${timestampMs}`,
      });
    }

    while ((match = PHONE_REGEX.exec(text)) !== null) {
      candidates.push({
        candidateId: `vid_pii_${crypto.randomUUID().slice(0, 8)}`,
        modality: 'VIDEO',
        entityType: 'PHONE_NUMBER',
        rawText: match[0],
        confidence,
        frameNumber,
        startMs: timestampMs,
        endMs: timestampMs + 1000,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        boundingBox,
        provenanceRef: `media:video:doc:${documentId}:frame:${frameNumber}:time:${timestampMs}`,
      });
    }

    while ((match = SSN_REGEX.exec(text)) !== null) {
      candidates.push({
        candidateId: `vid_pii_${crypto.randomUUID().slice(0, 8)}`,
        modality: 'VIDEO',
        entityType: 'US_SSN',
        rawText: match[0],
        confidence,
        frameNumber,
        startMs: timestampMs,
        endMs: timestampMs + 1000,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        boundingBox,
        provenanceRef: `media:video:doc:${documentId}:frame:${frameNumber}:time:${timestampMs}`,
      });
    }

    for (const pattern of NAME_PATTERNS) {
      while ((match = pattern.exec(text)) !== null) {
        const rawText = match[1] || match[0];
        if (rawText.length > 3 && !['Confidential', 'Client'].includes(rawText)) {
          candidates.push({
            candidateId: `vid_pii_${crypto.randomUUID().slice(0, 8)}`,
            modality: 'VIDEO',
            entityType: 'PERSON_NAME',
            rawText,
            confidence,
            frameNumber,
            startMs: timestampMs,
            endMs: timestampMs + 1000,
            startOffset: match.index,
            endOffset: match.index + rawText.length,
            boundingBox,
            provenanceRef: `media:video:doc:${documentId}:frame:${frameNumber}:time:${timestampMs}`,
          });
          break;
        }
      }
    }

    return candidates;
  }

  /**
   * Deduplicates candidates detected in consecutive frames with identical text and temporal proximity.
   * Merges temporal span (startMs to endMs).
   */
  public deduplicateAdjacentFrameCandidates(candidates: MediaPIICandidate[]): MediaPIICandidate[] {
    if (candidates.length <= 1) return candidates;

    const deduplicated: MediaPIICandidate[] = [];
    const seen = new Map<string, MediaPIICandidate>();

    for (const cand of candidates) {
      const key = `${cand.entityType}:${cand.rawText.toLowerCase()}`;
      const existing = seen.get(key);

      if (existing && existing.endMs && cand.startMs && cand.startMs - existing.endMs <= 2000) {
        // Extend temporal range of existing detection
        existing.endMs = Math.max(existing.endMs, cand.endMs || cand.startMs);
        if (cand.confidence !== null) {
          if (existing.confidence === null || cand.confidence > existing.confidence) {
            existing.confidence = cand.confidence;
          }
        }
      } else {
        const entry = { ...cand };
        seen.set(key, entry);
        deduplicated.push(entry);
      }
    }

    return deduplicated;
  }
}
