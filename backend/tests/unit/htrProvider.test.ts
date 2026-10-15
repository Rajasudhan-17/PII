import {
  TrOCRHandwritingRecognizer,
  IOCRProvider,
  OCRResult,
} from '../../src/services/ocr/ocr.provider';

describe('TrOCR Handwriting Recognizer Unit Tests', () => {
  class MockFallbackProvider implements IOCRProvider {
    async recognize(): Promise<OCRResult> {
      return {
        text: 'Fallback Tesseract Text',
        confidence: 85.0,
        blocks: [
          {
            text: 'Fallback Tesseract Text',
            confidence: 85.0,
            lines: [],
          },
        ],
        engineVersion: 'tesseract.js-5.1.1',
        recognitionMethod: 'PRINT_OCR',
      };
    }
  }

  it('should format TrOCR handwriting results with null confidence and model provenance', async () => {
    const mockHtr = new TrOCRHandwritingRecognizer(new MockFallbackProvider());

    // Mock fetch for HTR microservice
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'SUCCESS',
        text: 'Handwritten TrOCR Output Line',
        confidence: null,
        lines: [
          {
            text: 'Handwritten TrOCR Output Line',
            confidence: null,
            bbox: { x0: 10, y0: 10, x1: 200, y1: 50 },
          },
        ],
        modelId: 'microsoft/trocr-base-handwritten',
        modelRevision: '17242d54e4c27a296fa28e578496464522883307',
        processorId: 'TrOCRProcessor',
        runtimeVersion: 'transformers-4.38.1',
      }),
    }) as unknown as typeof fetch;

    try {
      const result = await mockHtr.recognizeHandwriting(Buffer.from('test_image_data'));

      expect(result.isHandwritten).toBe(true);
      expect(result.recognitionMethod).toBe('HANDWRITING_HTR');
      expect(result.confidence).toBeNull();
      expect(result.text).toBe('Handwritten TrOCR Output Line');
      expect(result.modelMetadata?.modelId).toBe('microsoft/trocr-base-handwritten');
      expect(result.modelMetadata?.modelRevision).toBe('17242d54e4c27a296fa28e578496464522883307');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should return HTR_UNAVAILABLE and reject silent fallback when HTR microservice is unreachable', async () => {
    const mockHtr = new TrOCRHandwritingRecognizer(new MockFallbackProvider());

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection ECONNREFUSED 127.0.0.1:8000')) as unknown as typeof fetch;

    try {
      const result = await mockHtr.recognizeHandwriting(Buffer.from('test_image_data'));

      expect(result.isHandwritten).toBe(false);
      expect(result.recognitionMethod).toBe('GENERIC_OCR_FALLBACK'); // MUST NOT be HANDWRITING_HTR
      expect(result.warning?.code).toBe('HTR_UNAVAILABLE');
      expect(result.text).toBe(''); // Silent fallback text rejected for handwriting requests
    } finally {
      global.fetch = originalFetch;
    }
  });
});
