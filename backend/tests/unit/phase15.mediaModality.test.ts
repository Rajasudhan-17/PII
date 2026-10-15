import {
  AudioProcessingEngine,
  OfflineDeterministicSTTProvider,
  SpeechToTextProvider,
} from '../../src/services/media/audioEngine';
import { VideoProcessingEngine } from '../../src/services/media/videoEngine';
import { MediaModalityService } from '../../src/services/media/mediaModalityService';
import { MediaProcessingResult } from '../../src/services/media/mediaTypes';
import { AppError } from '../../src/utils/AppError';

describe('Phase 15 — Advanced Modalities (Audio & Video) Unit Tests', () => {
  const testDocId = 'doc_test_12345';
  const testOrgId = 'org_test_67890';

  describe('AudioProcessingEngine', () => {
    test('transcribes audio and extracts timestamped segments with confidence and word provenance', async () => {
      const engine = new AudioProcessingEngine();
      const result = await engine.processAudio({
        audioFilePath: '/mock/storage/recording.mp3',
        documentId: testDocId,
        organizationId: testOrgId,
        knownDurationSeconds: 15,
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.modality).toBe('AUDIO');
      expect(result.coverageStatus).toBe('FULL_COVERAGE');
      expect(result.isSyntheticFixture).toBe(true);
      expect(result.providerType).toBe('OFFLINE_SYNTHETIC_FIXTURE');
      expect(result.audioResult?.isTranscribed).toBe(true);
      expect(result.audioResult?.isSyntheticFixture).toBe(true);
      expect(result.audioResult?.providerType).toBe('OFFLINE_SYNTHETIC_FIXTURE');
      expect(result.audioResult?.segments.length).toBeGreaterThan(0);

      // Verify timestamp provenance
      const firstSeg = result.audioResult!.segments[0];
      expect(firstSeg.startMs).toBeDefined();
      expect(firstSeg.endMs).toBeDefined();
      expect(firstSeg.confidence).toBeGreaterThan(0.9);
      expect(firstSeg.words?.length).toBeGreaterThan(0);

      // Verify PII candidates generated from transcript
      expect(result.candidates.length).toBeGreaterThan(0);
      const emailCandidate = result.candidates.find((c) => c.entityType === 'EMAIL_ADDRESS');
      expect(emailCandidate).toBeDefined();
      expect(emailCandidate?.rawText).toBe('test.user@example.com');
      expect(emailCandidate?.provenanceRef).toContain('media:audio:doc:');
      expect(emailCandidate?.confidence).toBe(0.95);
    });

    test('CONFIDENCE PROVENANCE: preserves null when underlying STT provider provides no confidence', async () => {
      const sttWithoutConfidence = new OfflineDeterministicSTTProvider({
        durationSeconds: 5,
        language: 'en',
        segments: [
          {
            startMs: 100,
            endMs: 2000,
            text: 'User email is unconfirmed@example.com for record.',
            confidence: null,
            words: [{ word: 'unconfirmed@example.com', startMs: 500, endMs: 1500, confidence: null }],
          },
        ],
      });
      const engine = new AudioProcessingEngine(undefined, sttWithoutConfidence);
      const result = await engine.processAudio({
        audioFilePath: '/mock/test.mp3',
        documentId: testDocId,
        organizationId: testOrgId,
      });

      expect(result.status).toBe('SUCCESS');
      const emailCandidate = result.candidates.find((c) => c.entityType === 'EMAIL_ADDRESS');
      expect(emailCandidate).toBeDefined();
      expect(emailCandidate?.confidence).toBeNull(); // Strictly null, NEVER invented
    });

    test('SAFETY INVARIANT: Disabled transcription NEVER returns verified clean; returns NOT_VERIFIABLE', async () => {
      const unconfiguredEngine = new AudioProcessingEngine({ transcriptionEnabled: false }, null);
      const result = await unconfiguredEngine.processAudio({
        audioFilePath: '/mock/storage/silent_call.wav',
        documentId: testDocId,
        organizationId: testOrgId,
        knownDurationSeconds: 10,
      });

      expect(result.status).toBe('NOT_VERIFIABLE');
      expect(result.coverageStatus).toBe('UNVERIFIABLE');
      expect(result.audioResult?.isTranscribed).toBe(false);
      expect(result.audioResult?.unverifiableReason).toBe('TRANSCRIPTION_UNAVAILABLE');
      expect(result.reasons[0]).toContain('TRANSCRIPTION_UNAVAILABLE');
      expect(result.candidates).toHaveLength(0);
    });

    test('SAFETY INVARIANT: STT provider failure returns NOT_VERIFIABLE with reason code', async () => {
      const failingSTTProvider: SpeechToTextProvider = {
        providerType: 'EXTERNAL_PRODUCTION_ASR',
        transcribe: jest.fn().mockRejectedValue(new Error('Connection reset by remote ASR service')),
      };

      const engine = new AudioProcessingEngine(undefined, failingSTTProvider);
      const result = await engine.processAudio({
        audioFilePath: '/mock/storage/failing.mp3',
        documentId: testDocId,
        organizationId: testOrgId,
      });

      expect(result.status).toBe('NOT_VERIFIABLE');
      expect(result.coverageStatus).toBe('UNVERIFIABLE');
      expect(result.audioResult?.unverifiableReason).toBe('TRANSCRIPTION_FAILED');
      expect(result.reasons[0]).toContain('Connection reset');
    });

    test('RESOURCE GOVERNANCE: rejects audio exceeding maximum duration limit (3600s)', async () => {
      const engine = new AudioProcessingEngine({ maxDurationSeconds: 60 });

      await expect(
        engine.processAudio({
          audioFilePath: '/mock/storage/long_audio.wav',
          documentId: testDocId,
          organizationId: testOrgId,
          knownDurationSeconds: 120, // 2 minutes > 60s limit
        })
      ).rejects.toThrow(AppError);

      try {
        await engine.processAudio({
          audioFilePath: '/mock/storage/long_audio.wav',
          documentId: testDocId,
          organizationId: testOrgId,
          knownDurationSeconds: 120,
        });
      } catch (err: unknown) {
        expect((err as AppError).errorCode).toBe('RESOURCE_LIMIT_EXCEEDED');
      }
    });
  });

  describe('VideoProcessingEngine', () => {
    test('extracts bounded frames, runs OCR, and deduplicates repeated candidates across adjacent frames', async () => {
      const engine = new VideoProcessingEngine({ sampleFps: 1, maxFrameCount: 10 });
      const result = await engine.processVideo({
        videoFilePath: '/mock/storage/presentation.mp4',
        documentId: testDocId,
        organizationId: testOrgId,
        knownDurationSeconds: 10,
        processAudioTrack: false,
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.modality).toBe('VIDEO');
      expect(result.videoResult?.frames.length).toBe(2);

      // Verify frame metadata
      const frame1 = result.videoResult!.frames[0];
      expect(frame1.frameNumber).toBe(1);
      expect(frame1.timestampMs).toBe(1000);
      expect(frame1.detectedTextBlocks?.length).toBeGreaterThan(0);

      // Verify deduplication: 'John Doe' was present in frame 1 (1000ms) and frame 2 (2000ms)
      const johnDoeCandidates = result.candidates.filter(
        (c) => c.entityType === 'PERSON_NAME' && c.rawText === 'John Doe'
      );
      // Because frames 1 and 2 are adjacent within 2000ms, candidate is merged rather than duplicated
      expect(johnDoeCandidates.length).toBe(1);
      expect(johnDoeCandidates[0].startMs).toBe(1000);
      expect(johnDoeCandidates[0].endMs).toBe(3000); // 2000ms frame + 1000ms duration
    });

    test('SAFETY INVARIANT: Partial frame inspection is reported honestly with PARTIAL_COVERAGE', async () => {
      // Total frames in video is 300, but only 2 frames sampled
      const engine = new VideoProcessingEngine({ maxFrameCount: 5 });
      const result = await engine.processVideo({
        videoFilePath: '/mock/storage/long_video.mp4',
        documentId: testDocId,
        organizationId: testOrgId,
        processAudioTrack: false,
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.coverageStatus).toBe('PARTIAL_COVERAGE');
      expect(result.videoResult?.isFullyInspected).toBe(false);
      expect(result.videoResult?.warnings[0].code).toBe('PARTIAL_FRAME_COVERAGE');
    });

    test('combines video frame OCR with audio track speech transcription', async () => {
      const sttFixture = new OfflineDeterministicSTTProvider({
        durationSeconds: 10,
        language: 'en',
        segments: [
          {
            startMs: 500,
            endMs: 3000,
            text: 'Contact our privacy office at privacy@testcompany.org.',
            confidence: 0.96,
          },
        ],
      });
      const audioEngine = new AudioProcessingEngine(undefined, sttFixture);
      const videoEngine = new VideoProcessingEngine({ audioEngine });

      const result = await videoEngine.processVideo({
        videoFilePath: '/mock/storage/webinar.mp4',
        documentId: testDocId,
        organizationId: testOrgId,
        processAudioTrack: true,
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.videoResult?.audioTranscription).toBeDefined();
      expect(result.videoResult?.audioTranscription?.isTranscribed).toBe(true);

      // Contains both video frame candidate ('John Doe') and audio candidate ('privacy@testcompany.org')
      const emailCand = result.candidates.find((c) => c.entityType === 'EMAIL_ADDRESS');
      expect(emailCand).toBeDefined();
      expect(emailCand?.rawText).toBe('privacy@testcompany.org');
      expect(emailCand?.modality).toBe('AUDIO');
    });

    test('CONFIDENCE PROVENANCE: preserves null when video OCR provides no confidence', async () => {
      const mockExtractor = {
        isSyntheticFixture: true,
        providerType: 'OFFLINE_SYNTHETIC_FIXTURE' as const,
        extractFrames: jest.fn().mockResolvedValue({
          durationSeconds: 2,
          totalFrameCount: 2,
          extractedFrames: [
            {
              frameNumber: 1,
              timestampMs: 500,
              width: 1280,
              height: 720,
              ocrTextBlocks: [
                {
                  text: 'Client contact: unconfirmed@example.com',
                  confidence: null,
                  x: 10,
                  y: 10,
                  width: 200,
                  height: 30,
                },
              ],
            },
          ],
        }),
      };
      const engine = new VideoProcessingEngine({ maxFrameCount: 5 }, mockExtractor);
      const result = await engine.processVideo({
        videoFilePath: '/mock/video.mp4',
        documentId: testDocId,
        organizationId: testOrgId,
        processAudioTrack: false,
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.isSyntheticFixture).toBe(true);
      expect(result.providerType).toBe('OFFLINE_SYNTHETIC_FIXTURE');
      const emailCandidate = result.candidates.find((c) => c.entityType === 'EMAIL_ADDRESS');
      expect(emailCandidate).toBeDefined();
      expect(emailCandidate?.confidence).toBeNull(); // Strictly null, NEVER invented
    });

    test('RESOURCE GOVERNANCE: rejects video exceeding duration limits', async () => {
      const engine = new VideoProcessingEngine({ maxDurationSeconds: 10 });

      await expect(
        engine.processVideo({
          videoFilePath: '/mock/storage/feature_film.mkv',
          documentId: testDocId,
          organizationId: testOrgId,
          knownDurationSeconds: 7200, // 2 hours > 10s limit
        })
      ).rejects.toThrow(AppError);
    });
  });

  describe('MediaModalityService', () => {
    test('correctly identifies modality based on extension and mime type', () => {
      const service = new MediaModalityService();

      expect(service.detectModality('mp3')).toBe('AUDIO');
      expect(service.detectModality('wav')).toBe('AUDIO');
      expect(service.detectModality('flac')).toBe('AUDIO');
      expect(service.detectModality('unknown', 'audio/mpeg')).toBe('AUDIO');

      expect(service.detectModality('mp4')).toBe('VIDEO');
      expect(service.detectModality('mkv')).toBe('VIDEO');
      expect(service.detectModality('webm')).toBe('VIDEO');
      expect(service.detectModality('unknown', 'video/mp4')).toBe('VIDEO');

      expect(service.detectModality('pdf')).toBe('DOCUMENT');
      expect(service.detectModality('docx')).toBe('DOCUMENT');
      expect(service.detectModality('png')).toBe('DOCUMENT');
    });

    test('convertMediaResultToNormalizedBlocks transforms media findings to INormalizedBlock objects', () => {
      const service = new MediaModalityService();
      const mockResult: MediaProcessingResult = {
        documentId: testDocId,
        organizationId: testOrgId,
        modality: 'AUDIO',
        status: 'SUCCESS',
        candidates: [],
        providerType: 'OFFLINE_SYNTHETIC_FIXTURE',
        isSyntheticFixture: true,
        processingTimeMs: 10,
        coverageStatus: 'FULL_COVERAGE',
        reasons: [],
        audioResult: {
          status: 'SUCCESS',
          durationSeconds: 3,
          rawTranscriptText: 'This is spoken dialogue',
          isTranscribed: true,
          providerType: 'OFFLINE_SYNTHETIC_FIXTURE',
          isSyntheticFixture: true,
          warnings: [],
          segments: [
            {
              segmentId: 'seg_1',
              startMs: 0,
              endMs: 2500,
              text: 'This is spoken dialogue',
              confidence: 0.94,
              words: [{ word: 'This', startMs: 0, endMs: 200, confidence: 0.95 }],
            },
          ],
        },
      };

      const blocks = service.convertMediaResultToNormalizedBlocks(mockResult);
      expect(blocks.length).toBe(1);
      expect(blocks[0].blockId).toBe('seg_1');
      expect(blocks[0].text).toBe('This is spoken dialogue');
      expect(blocks[0].confidence).toBe(0.94);
      expect(blocks[0].provenance.documentId).toBe(testDocId);
      expect(blocks[0].provenance.organizationId).toBe(testOrgId);
      expect(blocks[0].provenance.sourceRef).toContain('audio:time:0-2500');
    });
  });
});
