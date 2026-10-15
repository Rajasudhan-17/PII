import {
  TrOCRHandwritingRecognizer,
  IOCRProvider,
  OCRResult,
} from '../../src/services/ocr/ocr.provider';

describe('OCR & HTR Provider Unit Tests', () => {
  class MockOCRProvider implements IOCRProvider {
    constructor(private mockResult: OCRResult) {}

    async recognize(): Promise<OCRResult> {
      return this.mockResult;
    }
  }

  it('should issue generic fallback warning when HTR service is unavailable', async () => {
    const mockData: OCRResult = {
      text: 'Handwritten Sample Text',
      confidence: 45.5,
      blocks: [
        {
          text: 'Handwritten Sample Text',
          confidence: 45.5,
          lines: [
            {
              text: 'Handwritten Sample Text',
              confidence: 45.5,
              bbox: { x0: 10, y0: 10, x1: 200, y1: 50 },
              words: [
                { text: 'Handwritten', confidence: 50.0, bbox: { x0: 10, y0: 10, x1: 100, y1: 50 } },
                { text: 'Sample', confidence: 42.0, bbox: { x0: 105, y0: 10, x1: 160, y1: 50 } },
                { text: 'Text', confidence: 44.5, bbox: { x0: 165, y0: 10, x1: 200, y1: 50 } },
              ],
            },
          ],
        },
      ],
      engineVersion: 'tesseract.js-5.1.1',
      recognitionMethod: 'PRINT_OCR',
    };

    const mockProvider = new MockOCRProvider(mockData);
    const htr = new TrOCRHandwritingRecognizer(mockProvider);

    // Mock fetch failure to trigger generic fallback
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('HTR unavailable')) as unknown as typeof fetch;

    try {
      const result = await htr.recognizeHandwriting(Buffer.from('dummy_image_data'));

      expect(result.isHandwritten).toBe(false);
      expect(result.recognitionMethod).toBe('GENERIC_OCR_FALLBACK');
      expect(result.warning?.code).toBe('HTR_UNAVAILABLE');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should correctly format generic OCR fallback output', async () => {
    const mockData: OCRResult = {
      text: 'Clear Note',
      confidence: 88.0,
      blocks: [],
      engineVersion: 'tesseract.js-5.1.1',
      recognitionMethod: 'PRINT_OCR',
    };

    const mockProvider = new MockOCRProvider(mockData);
    const htr = new TrOCRHandwritingRecognizer(mockProvider);

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('HTR unavailable')) as unknown as typeof fetch;

    try {
      const result = await htr.recognizeHandwriting(Buffer.from('dummy_image_data'));

      expect(result.isHandwritten).toBe(false);
      expect(result.recognitionMethod).toBe('GENERIC_OCR_FALLBACK');
      expect(result.warning?.code).toBe('HTR_UNAVAILABLE');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
