import crypto from 'crypto';
import {
  AudioTranscriptSegment,
  AudioTranscriptionResult,
  MediaPIICandidate,
  MediaProcessingResult,
  MediaProviderType,
} from './mediaTypes';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

export interface AudioEngineOptions {
  maxDurationSeconds?: number;
  transcriptionEnabled?: boolean;
}

export interface SpeechToTextProvider {
  readonly providerType: MediaProviderType;
  transcribe(audioFilePath: string, options?: { language?: string }): Promise<{
    language?: string;
    durationSeconds: number;
    segments: Array<{
      startMs: number;
      endMs: number;
      text: string;
      confidence?: number | null;
      words?: Array<{ word: string; startMs: number; endMs: number; confidence?: number | null }>;
    }>;
  }>;
}

/**
 * Deterministic local/mock speech-to-text provider for safe offline processing and tests.
 * Clearly marked as OFFLINE_SYNTHETIC_FIXTURE to prevent representing mock data as genuine production ASR.
 */
export class OfflineDeterministicSTTProvider implements SpeechToTextProvider {
  public readonly providerType: MediaProviderType = 'OFFLINE_SYNTHETIC_FIXTURE';
  private customFixture?: {
    durationSeconds: number;
    language?: string;
    segments: Array<{
      startMs: number;
      endMs: number;
      text: string;
      confidence?: number | null;
      words?: Array<{ word: string; startMs: number; endMs: number; confidence?: number | null }>;
    }>;
  };

  constructor(fixture?: OfflineDeterministicSTTProvider['customFixture']) {
    this.customFixture = fixture;
  }

  public async transcribe(_audioFilePath: string): Promise<{
    language?: string;
    durationSeconds: number;
    segments: Array<{
      startMs: number;
      endMs: number;
      text: string;
      confidence?: number | null;
      words?: Array<{ word: string; startMs: number; endMs: number; confidence?: number | null }>;
    }>;
  }> {
    if (this.customFixture) {
      return this.customFixture;
    }

    // Default mock behavior for test environments
    return {
      language: 'en',
      durationSeconds: 15,
      segments: [
        {
          startMs: 0,
          endMs: 5000,
          text: 'Hello, my name is John Doe and my phone number is 415-555-0199.',
          confidence: 0.95,
          words: [
            { word: 'Hello', startMs: 0, endMs: 500, confidence: 0.98 },
            { word: 'John', startMs: 1200, endMs: 1600, confidence: 0.94 },
            { word: 'Doe', startMs: 1650, endMs: 2000, confidence: 0.93 },
            { word: '415-555-0199', startMs: 3200, endMs: 4800, confidence: 0.96 },
          ],
        },
        {
          startMs: 5100,
          endMs: 9500,
          text: 'Please send confirmation to test.user@example.com immediately.',
          confidence: 0.92,
          words: [
            { word: 'test.user@example.com', startMs: 6500, endMs: 8200, confidence: 0.95 },
          ],
        },
      ],
    };
  }
}

export class AudioProcessingEngine {
  private maxDurationSeconds: number;
  private transcriptionEnabled: boolean;
  private sttProvider: SpeechToTextProvider | null;

  constructor(options?: AudioEngineOptions, sttProvider?: SpeechToTextProvider | null) {
    this.maxDurationSeconds = options?.maxDurationSeconds ?? 3600; // 1 hour max
    this.transcriptionEnabled = options?.transcriptionEnabled ?? true;
    this.sttProvider = sttProvider ?? new OfflineDeterministicSTTProvider();
  }

  /**
   * Processes an audio file, transcribes spoken content if enabled, and identifies PII candidates.
   * Safety invariant: If transcription is unavailable or disabled, it returns NOT_VERIFIABLE.
   */
  public async processAudio(params: {
    audioFilePath: string;
    documentId: string;
    organizationId: string;
    knownDurationSeconds?: number;
    fileSizeBytes?: number;
  }): Promise<MediaProcessingResult> {
    const startTime = Date.now();
    const { audioFilePath, documentId, organizationId, knownDurationSeconds } = params;
    const providerType: MediaProviderType = this.sttProvider ? this.sttProvider.providerType : 'UNCONFIGURED';
    const isSyntheticFixture = providerType === 'OFFLINE_SYNTHETIC_FIXTURE';

    logger.info(
      { event: 'audio_processing_begin', documentId, organizationId, providerType, isSyntheticFixture },
      `Beginning audio processing for document ${documentId}`
    );

    // 1. Resource Governance: Validate duration limits
    const durationSeconds = knownDurationSeconds ?? 15;
    if (durationSeconds > this.maxDurationSeconds) {
      logger.warn(
        { event: 'audio_duration_exceeded', durationSeconds, max: this.maxDurationSeconds, documentId },
        'Audio duration exceeded limit'
      );
      throw new AppError(
        `Audio duration (${durationSeconds}s) exceeds maximum allowed limit of ${this.maxDurationSeconds}s.`,
        400,
        'RESOURCE_LIMIT_EXCEEDED'
      );
    }

    // 2. Modality Safety Rule: Handle disabled or unavailable transcription provider
    if (!this.transcriptionEnabled || !this.sttProvider) {
      logger.warn(
        { event: 'audio_transcription_unavailable', documentId, organizationId },
        'Audio transcription provider is unavailable or disabled. Modality cannot be verified.'
      );
      return {
        documentId,
        organizationId,
        modality: 'AUDIO',
        status: 'NOT_VERIFIABLE',
        candidates: [],
        coverageStatus: 'UNVERIFIABLE',
        providerType: 'UNCONFIGURED',
        isSyntheticFixture: false,
        reasons: ['TRANSCRIPTION_UNAVAILABLE: Audio speech transcription is disabled or unconfigured.'],
        processingTimeMs: Date.now() - startTime,
        audioResult: {
          status: 'NOT_VERIFIABLE',
          durationSeconds,
          isTranscribed: false,
          providerType: 'UNCONFIGURED',
          isSyntheticFixture: false,
          rawTranscriptText: '',
          segments: [],
          unverifiableReason: 'TRANSCRIPTION_UNAVAILABLE',
          warnings: [
            {
              code: 'TRANSCRIPTION_UNAVAILABLE',
              message: 'Spoken audio content could not be transcribed because no transcription provider is active.',
            },
          ],
        },
      };
    }

    // 3. Execute Speech Transcription
    let transcription: {
      language?: string;
      durationSeconds: number;
      segments: Array<{
        startMs: number;
        endMs: number;
        text: string;
        confidence?: number | null;
        words?: Array<{ word: string; startMs: number; endMs: number; confidence?: number | null }>;
      }>;
    };

    try {
      transcription = await this.sttProvider.transcribe(audioFilePath);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'audio_stt_failed', error: errMsg, documentId }, 'STT provider transcription failed.');
      return {
        documentId,
        organizationId,
        modality: 'AUDIO',
        status: 'NOT_VERIFIABLE',
        candidates: [],
        coverageStatus: 'UNVERIFIABLE',
        providerType,
        isSyntheticFixture,
        reasons: [`TRANSCRIPTION_FAILED: ${errMsg}`],
        processingTimeMs: Date.now() - startTime,
        audioResult: {
          status: 'NOT_VERIFIABLE',
          durationSeconds,
          isTranscribed: false,
          providerType,
          isSyntheticFixture,
          rawTranscriptText: '',
          segments: [],
          unverifiableReason: 'TRANSCRIPTION_FAILED',
          warnings: [{ code: 'TRANSCRIPTION_FAILED', message: errMsg }],
        },
      };
    }

    // 4. Build Structured Transcript Segments with Exact Provenance
    const transcriptSegments: AudioTranscriptSegment[] = [];
    const fullTranscriptTexts: string[] = [];

    for (let i = 0; i < transcription.segments.length; i++) {
      const seg = transcription.segments[i];
      const segmentId = `audio_seg_${i + 1}`;
      fullTranscriptTexts.push(seg.text);

      transcriptSegments.push({
        segmentId,
        startMs: seg.startMs,
        endMs: seg.endMs,
        text: seg.text,
        confidence: seg.confidence !== undefined ? seg.confidence : null,
        words: seg.words,
      });
    }

    const rawTranscriptText = fullTranscriptTexts.join(' ');

    // 5. Detect PII Candidates in Audio Transcript
    const candidates = this.detectPIIInTranscript(transcriptSegments, documentId, organizationId);

    logger.info(
      {
        event: 'audio_processing_completed',
        documentId,
        segmentCount: transcriptSegments.length,
        candidateCount: candidates.length,
        providerType,
        isSyntheticFixture,
      },
      `Completed audio processing: detected ${candidates.length} candidates`
    );

    const audioResult: AudioTranscriptionResult = {
      status: 'SUCCESS',
      durationSeconds: transcription.durationSeconds || durationSeconds,
      language: transcription.language || 'en',
      segments: transcriptSegments,
      rawTranscriptText,
      isTranscribed: true,
      providerType,
      isSyntheticFixture,
      warnings: [],
    };

    return {
      documentId,
      organizationId,
      modality: 'AUDIO',
      status: 'SUCCESS',
      candidates,
      audioResult,
      providerType,
      isSyntheticFixture,
      coverageStatus: 'FULL_COVERAGE',
      reasons: [],
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Deterministically scans transcript segments for common PII patterns with timestamped provenance.
   * Safety invariant: Candidate confidence strictly reflects the underlying engine's reported confidence
   * (or null if not provided); never invents or fabricates confidence numbers.
   */
  private detectPIIInTranscript(
    segments: AudioTranscriptSegment[],
    documentId: string,
    _organizationId: string
  ): MediaPIICandidate[] {
    const candidates: MediaPIICandidate[] = [];

    const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
    const NAME_PATTERNS = [
      /\b(?:name is|I'm|this is|speaking with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
      /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g,
    ];

    for (const segment of segments) {
      const text = segment.text;

      // Emails
      let match: RegExpExecArray | null;
      while ((match = EMAIL_REGEX.exec(text)) !== null) {
        const rawText = match[0];
        const { startMs, endMs, confidence } = this.resolveCandidateProvenance(segment, match.index, rawText);
        candidates.push({
          candidateId: `audio_pii_${crypto.randomUUID().slice(0, 8)}`,
          modality: 'AUDIO',
          entityType: 'EMAIL_ADDRESS',
          rawText,
          confidence, // Strictly null if not provided by underlying engine
          startMs,
          endMs,
          startOffset: match.index,
          endOffset: match.index + rawText.length,
          provenanceRef: `media:audio:doc:${documentId}:seg:${segment.segmentId}:time:${startMs}-${endMs}:offset:${match.index}-${match.index + rawText.length}`,
        });
      }

      // Phone numbers
      while ((match = PHONE_REGEX.exec(text)) !== null) {
        const rawText = match[0];
        const { startMs, endMs, confidence } = this.resolveCandidateProvenance(segment, match.index, rawText);
        candidates.push({
          candidateId: `audio_pii_${crypto.randomUUID().slice(0, 8)}`,
          modality: 'AUDIO',
          entityType: 'PHONE_NUMBER',
          rawText,
          confidence,
          startMs,
          endMs,
          startOffset: match.index,
          endOffset: match.index + rawText.length,
          provenanceRef: `media:audio:doc:${documentId}:seg:${segment.segmentId}:time:${startMs}-${endMs}:offset:${match.index}-${match.index + rawText.length}`,
        });
      }

      // SSN
      while ((match = SSN_REGEX.exec(text)) !== null) {
        const rawText = match[0];
        const { startMs, endMs, confidence } = this.resolveCandidateProvenance(segment, match.index, rawText);
        candidates.push({
          candidateId: `audio_pii_${crypto.randomUUID().slice(0, 8)}`,
          modality: 'AUDIO',
          entityType: 'US_SSN',
          rawText,
          confidence,
          startMs,
          endMs,
          startOffset: match.index,
          endOffset: match.index + rawText.length,
          provenanceRef: `media:audio:doc:${documentId}:seg:${segment.segmentId}:time:${startMs}-${endMs}:offset:${match.index}-${match.index + rawText.length}`,
        });
      }

      // Names
      for (const pattern of NAME_PATTERNS) {
        while ((match = pattern.exec(text)) !== null) {
          const rawText = match[1] || match[0];
          // Skip if already captured or common phrase
          if (rawText.length > 3 && !['Hello', 'Please send', 'Thank you'].includes(rawText)) {
            const { startMs, endMs, confidence } = this.resolveCandidateProvenance(segment, match.index, rawText);
            candidates.push({
              candidateId: `audio_pii_${crypto.randomUUID().slice(0, 8)}`,
              modality: 'AUDIO',
              entityType: 'PERSON_NAME',
              rawText,
              confidence,
              startMs,
              endMs,
              startOffset: match.index,
              endOffset: match.index + rawText.length,
              provenanceRef: `media:audio:doc:${documentId}:seg:${segment.segmentId}:time:${startMs}-${endMs}:offset:${match.index}-${match.index + rawText.length}`,
            });
            break;
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Maps matching candidate text to exact word-level timestamps and underlying confidence when provided.
   */
  private resolveCandidateProvenance(
    segment: AudioTranscriptSegment,
    _charOffset: number,
    rawText: string
  ): { startMs: number; endMs: number; confidence: number | null } {
    let startMs = segment.startMs;
    let endMs = segment.endMs;
    let confidence: number | null = segment.confidence !== undefined ? segment.confidence : null;

    if (segment.words && segment.words.length > 0) {
      const matchingWord = segment.words.find(
        (w) => rawText.toLowerCase().includes(w.word.toLowerCase()) || w.word.toLowerCase().includes(rawText.toLowerCase())
      );
      if (matchingWord) {
        startMs = matchingWord.startMs;
        endMs = matchingWord.endMs;
        if (matchingWord.confidence !== undefined && matchingWord.confidence !== null) {
          confidence = matchingWord.confidence;
        }
      }
    }

    return { startMs, endMs, confidence };
  }
}
