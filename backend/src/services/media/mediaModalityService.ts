import path from 'path';
import { DocumentModel } from '../../models/document.model';
import { tenantScope } from '../../utils/tenantQuery';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { logAuthAuditEvent } from '../audit.service';
import { AudioProcessingEngine } from './audioEngine';
import { VideoProcessingEngine } from './videoEngine';
import { MediaProcessingResult } from './mediaTypes';
import { storageService } from '../storage/storage.service';

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'mov', 'webm']);

import { INormalizedBlock } from '../../models/normalizedDocument.model';

export class MediaModalityService {
  private audioEngine: AudioProcessingEngine;
  private videoEngine: VideoProcessingEngine;

  constructor(audioEngine?: AudioProcessingEngine, videoEngine?: VideoProcessingEngine) {
    this.audioEngine = audioEngine ?? new AudioProcessingEngine();
    this.videoEngine = videoEngine ?? new VideoProcessingEngine({ audioEngine: this.audioEngine });
  }

  /**
   * Identifies modality of a document based on extension or MIME type.
   */
  public detectModality(extension: string, mimeType?: string): 'AUDIO' | 'VIDEO' | 'DOCUMENT' {
    const ext = extension.toLowerCase();
    if (AUDIO_EXTENSIONS.has(ext) || (mimeType && mimeType.startsWith('audio/'))) {
      return 'AUDIO';
    }
    if (VIDEO_EXTENSIONS.has(ext) || (mimeType && mimeType.startsWith('video/'))) {
      return 'VIDEO';
    }
    return 'DOCUMENT';
  }

  /**
   * Securely processes an authorized media document, executing audio/video analysis
   * while maintaining immutable source integrity, tenant isolation, and PII-safe audit logging.
   */
  public async processMediaDocument(params: {
    documentId: string;
    organizationId: string;
    userId?: string;
    requestId?: string;
    ip?: string;
    options?: {
      transcriptionEnabled?: boolean;
      sampleFps?: number;
    };
  }): Promise<MediaProcessingResult> {
    const { documentId, organizationId, userId, requestId, ip } = params;

    // 1. Tenant-isolated document fetch
    const doc = await DocumentModel.findOne(tenantScope(organizationId, { _id: documentId, isDeleted: false }));
    if (!doc) {
      logAuthAuditEvent({
        event: 'MEDIA_PROCESSING_DENIED',
        userId,
        organizationId,
        requestId,
        ip,
        outcome: 'DENIED',
        reason: 'DOCUMENT_NOT_FOUND',
      });
      throw new AppError('Document not found or access denied.', 404, 'DOCUMENT_NOT_FOUND');
    }

    const modality = this.detectModality(doc.extension, doc.detectedMimeType);
    if (modality === 'DOCUMENT') {
      throw new AppError(
        `Document extension .${doc.extension} is not an advanced media format (Audio/Video).`,
        400,
        'UNSUPPORTED_MEDIA_TYPE'
      );
    }

    // 2. Resolve safe immutable file path
    const absolutePath = path.resolve(storageService.getAbsolutePath(doc.storageKey));

    logAuthAuditEvent({
      event: 'MEDIA_PROCESSING_STARTED',
      userId,
      organizationId,
      requestId,
      ip,
      outcome: 'SUCCESS',
      details: { documentId, modality, extension: doc.extension, size: doc.size },
    });

    try {
      let result: MediaProcessingResult;

      if (modality === 'AUDIO') {
        result = await this.audioEngine.processAudio({
          audioFilePath: absolutePath,
          documentId,
          organizationId,
          fileSizeBytes: doc.size,
        });
      } else {
        result = await this.videoEngine.processVideo({
          videoFilePath: absolutePath,
          documentId,
          organizationId,
        });
      }

      logAuthAuditEvent({
        event: 'MEDIA_PROCESSING_COMPLETED',
        userId,
        organizationId,
        requestId,
        ip,
        outcome: 'SUCCESS',
        details: {
          documentId,
          modality,
          status: result.status,
          coverageStatus: result.coverageStatus,
          candidateCount: result.candidates.length,
          processingTimeMs: result.processingTimeMs,
        },
      });

      return result;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'media_processing_error', documentId, organizationId, error: errMsg }, 'Error processing media document.');

      logAuthAuditEvent({
        event: 'MEDIA_PROCESSING_FAILED',
        userId,
        organizationId,
        requestId,
        ip,
        outcome: 'FAILURE',
        reason: errMsg,
      });

      throw err;
    }
  }

  /**
   * Adapts media processing findings (audio transcript segments or video frame OCR blocks)
   * into standardized INormalizedBlock representations for downstream PII detection,
   * risk analysis, verification, and human review pipelines.
   */
  public convertMediaResultToNormalizedBlocks(result: MediaProcessingResult): INormalizedBlock[] {
    const blocks: INormalizedBlock[] = [];
    let readingOrderIndex = 0;

    if (result.audioResult && result.audioResult.segments) {
      for (const seg of result.audioResult.segments) {
        blocks.push({
          blockId: seg.segmentId,
          type: 'TEXT',
          text: seg.text,
          readingOrderIndex: readingOrderIndex++,
          startOffset: seg.startMs,
          endOffset: seg.endMs,
          confidence: seg.confidence !== undefined ? seg.confidence : null,
          recognitionMethod: 'GENERIC_OCR_FALLBACK',
          words: seg.words?.map((w) => ({
            text: w.word,
            confidence: w.confidence !== undefined ? w.confidence : null,
          })),
          provenance: {
            documentId: result.documentId,
            organizationId: result.organizationId,
            blockId: seg.segmentId,
            sourceRef: `audio:time:${seg.startMs}-${seg.endMs}`,
          },
        });
      }
    }

    if (result.videoResult && result.videoResult.frames) {
      for (const frame of result.videoResult.frames) {
        if (frame.detectedTextBlocks) {
          for (let bIdx = 0; bIdx < frame.detectedTextBlocks.length; bIdx++) {
            const block = frame.detectedTextBlocks[bIdx];
            const blockId = `vid_f${frame.frameNumber}_b${bIdx + 1}`;
            blocks.push({
              blockId,
              type: 'TEXT',
              text: block.text,
              pageNumber: frame.frameNumber,
              readingOrderIndex: readingOrderIndex++,
              startOffset: frame.timestampMs,
              endOffset: frame.timestampMs + 1000,
              boundingBox: block.boundingBox,
              confidence: block.confidence !== undefined ? block.confidence : null,
              recognitionMethod: 'PRINT_OCR',
              provenance: {
                documentId: result.documentId,
                organizationId: result.organizationId,
                pageNumber: frame.frameNumber,
                blockId,
                sourceRef: `video:frame:${frame.frameNumber}:time:${frame.timestampMs}`,
              },
            });
          }
        }
      }
    }

    return blocks;
  }
}

export const mediaModalityService = new MediaModalityService();
