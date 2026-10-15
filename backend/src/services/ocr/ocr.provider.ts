import { createWorker } from 'tesseract.js';
import { logger } from '../../utils/logger';
import { getConfig } from '../../config/env';

export interface BoundingBoxCoords {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OCRWord {
  text: string;
  confidence: number | null;
  bbox: BoundingBoxCoords;
}

export interface OCRLine {
  text: string;
  confidence: number | null;
  bbox: BoundingBoxCoords;
  words: OCRWord[];
}

export interface OCRBlock {
  text: string;
  confidence: number | null;
  bbox?: BoundingBoxCoords;
  lines: OCRLine[];
}

export interface OCRResult {
  text: string;
  confidence: number | null;
  blocks: OCRBlock[];
  engineVersion: string;
  recognitionMethod?: 'NATIVE_TEXT' | 'PRINT_OCR' | 'HANDWRITING_HTR' | 'GENERIC_OCR_FALLBACK';
  modelMetadata?: {
    modelId?: string;
    modelRevision?: string;
    processorId?: string;
    runtimeVersion?: string;
  };
}

export interface OCROptions {
  language?: string;
  renderDpi?: number;
}

export interface IOCRProvider {
  recognize(imageBuffer: Buffer, options?: OCROptions): Promise<OCRResult>;
}

export interface HTRResult extends OCRResult {
  isHandwritten: boolean;
  warning?: { code: string; message: string };
}

export interface IHandwritingRecognizer {
  recognizeHandwriting(imageBuffer: Buffer, options?: OCROptions): Promise<HTRResult>;
}

interface TesseractBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface TesseractWordData {
  text?: string;
  confidence?: number;
  bbox?: TesseractBBox;
}

interface TesseractLineData {
  text?: string;
  confidence?: number;
  bbox?: TesseractBBox;
  words?: TesseractWordData[];
}

interface TesseractParagraphData {
  lines?: TesseractLineData[];
}

interface TesseractBlockData {
  text?: string;
  confidence?: number;
  bbox?: TesseractBBox;
  lines?: TesseractLineData[];
  paragraphs?: TesseractParagraphData[];
}

export class TesseractOCRProvider implements IOCRProvider {
  private readonly engineVersion = 'tesseract.js-5.1.1';

  async recognize(imageBuffer: Buffer, options: OCROptions = {}): Promise<OCRResult> {
    const lang = options.language || 'eng';
    let worker;

    try {
      worker = await createWorker(lang, undefined, {
        errorHandler: (workerErr: unknown) => {
          logger.warn({ error: String(workerErr) }, 'Tesseract internal worker error caught');
        },
      });
      const res = await worker.recognize(imageBuffer);
      const data = res.data as { blocks?: TesseractBlockData[]; lines?: TesseractLineData[]; text?: string; confidence?: number };

      const blocks: OCRBlock[] = (data.blocks || []).map((b: TesseractBlockData) => {
        const rawLines: TesseractLineData[] = b.lines || (b.paragraphs ? b.paragraphs.flatMap((p: TesseractParagraphData) => p.lines || []) : []);

        const lines: OCRLine[] = rawLines.map((l: TesseractLineData) => {
          const words: OCRWord[] = (l.words || []).map((w: TesseractWordData) => ({
            text: w.text ? w.text.trim() : '',
            confidence: w.confidence !== undefined ? w.confidence : null,
            bbox: {
              x0: w.bbox ? w.bbox.x0 : 0,
              y0: w.bbox ? w.bbox.y0 : 0,
              x1: w.bbox ? w.bbox.x1 : 0,
              y1: w.bbox ? w.bbox.y1 : 0,
            },
          }));

          return {
            text: l.text ? l.text.trim() : '',
            confidence: l.confidence !== undefined ? l.confidence : null,
            bbox: {
              x0: l.bbox ? l.bbox.x0 : 0,
              y0: l.bbox ? l.bbox.y0 : 0,
              x1: l.bbox ? l.bbox.x1 : 0,
              y1: l.bbox ? l.bbox.y1 : 0,
            },
            words,
          };
        });

        return {
          text: b.text ? b.text.trim() : '',
          confidence: b.confidence !== undefined ? b.confidence : null,
          bbox: b.bbox
            ? {
                x0: b.bbox.x0,
                y0: b.bbox.y0,
                x1: b.bbox.x1,
                y1: b.bbox.y1,
              }
            : undefined,
          lines,
        };
      });

      // If blocks are empty but lines exist at root data level, construct fallback block
      if (blocks.length === 0 && data.lines && data.lines.length > 0) {
        const lines: OCRLine[] = data.lines.map((l: TesseractLineData) => ({
          text: l.text ? l.text.trim() : '',
          confidence: l.confidence !== undefined ? l.confidence : null,
          bbox: {
            x0: l.bbox ? l.bbox.x0 : 0,
            y0: l.bbox ? l.bbox.y0 : 0,
            x1: l.bbox ? l.bbox.x1 : 0,
            y1: l.bbox ? l.bbox.y1 : 0,
          },
          words: (l.words || []).map((w: TesseractWordData) => ({
            text: w.text ? w.text.trim() : '',
            confidence: w.confidence !== undefined ? w.confidence : null,
            bbox: {
              x0: w.bbox ? w.bbox.x0 : 0,
              y0: w.bbox ? w.bbox.y0 : 0,
              x1: w.bbox ? w.bbox.x1 : 0,
              y1: w.bbox ? w.bbox.y1 : 0,
            },
          })),
        }));

        blocks.push({
          text: data.text ? data.text.trim() : '',
          confidence: data.confidence !== undefined ? data.confidence : null,
          lines,
        });
      }

      return {
        text: data.text ? data.text.trim() : '',
        confidence: data.confidence !== undefined ? data.confidence : null,
        blocks,
        engineVersion: this.engineVersion,
        recognitionMethod: 'PRINT_OCR',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      logger.error({ error: errMsg, stack: errStack }, 'Tesseract OCR Recognition failed');
      throw new Error(`OCR processing failed: ${errMsg}`);
    } finally {
      if (worker) {
        await worker.terminate();
      }
    }
  }
}

export class TrOCRHandwritingRecognizer implements IHandwritingRecognizer {
  private _fallbackOcrProvider: IOCRProvider;

  constructor(fallbackOcrProvider?: IOCRProvider) {
    this._fallbackOcrProvider = fallbackOcrProvider || new TesseractOCRProvider();
  }

  public get fallbackOcrProvider(): IOCRProvider {
    return this._fallbackOcrProvider;
  }

  async recognizeHandwriting(imageBuffer: Buffer, options: OCROptions = {}): Promise<HTRResult> {
    const htrUrl = getConfig().HTR_SERVICE_URL;

    try {
      const imageBase64 = imageBuffer.toString('base64');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second inference timeout

      const response = await fetch(`${htrUrl}/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: imageBase64,
          language: options.language || 'eng',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as {
          status: string;
          text: string;
          confidence: number | null;
          lines: Array<{ text: string; confidence: number | null; bbox?: BoundingBoxCoords }>;
          modelId: string;
          modelRevision?: string;
          processorId?: string;
          runtimeVersion?: string;
          warning?: { code: string; message: string };
        };

        if (data.status === 'SUCCESS' && data.text) {
          const lines: OCRLine[] = (data.lines || []).map((l) => ({
            text: l.text,
            confidence: null, // TrOCR confidence is strictly null
            bbox: l.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
            words: [], // Word-level coordinates not fabricated from line recognition
          }));

          const block: OCRBlock = {
            text: data.text,
            confidence: null, // Strictly null
            lines,
          };

          return {
            text: data.text,
            confidence: null, // Strictly null for TrOCR outputs
            blocks: [block],
            engineVersion: `TrOCR-${data.modelRevision || '17242d54e4c27a296fa28e578496464522883307'}`,
            recognitionMethod: 'HANDWRITING_HTR',
            isHandwritten: true,
            modelMetadata: {
              modelId: data.modelId || 'microsoft/trocr-base-handwritten',
              modelRevision: data.modelRevision || '17242d54e4c27a296fa28e578496464522883307',
              processorId: data.processorId || 'TrOCRProcessor',
              runtimeVersion: data.runtimeVersion || 'transformers-4.38.1',
            },
            warning: data.warning,
          };
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'TrOCR HTR microservice request failed; HTR_UNAVAILABLE returned');
    }

    // REQUIREMENT 5: Ensure isHandwriting=true does NOT silently fall back to generic Tesseract OCR.
    // Return HTR_UNAVAILABLE instead.
    return {
      text: '',
      confidence: null,
      blocks: [],
      engineVersion: 'TrOCR-17242d54e4c27a296fa28e578496464522883307',
      recognitionMethod: 'GENERIC_OCR_FALLBACK',
      isHandwritten: false,
      modelMetadata: {
        modelId: 'microsoft/trocr-base-handwritten',
        modelRevision: '17242d54e4c27a296fa28e578496464522883307',
        processorId: 'TrOCRProcessor',
        runtimeVersion: 'transformers-4.38.1',
      },
      warning: {
        code: 'HTR_UNAVAILABLE',
        message: 'TrOCR handwriting recognition microservice unavailable. Silent fallback to generic OCR rejected for handwriting requests.',
      },
    };
  }
}

// Alias HandwritingRecognizer to TrOCRHandwritingRecognizer for backwards compatibility
export const HandwritingRecognizer = TrOCRHandwritingRecognizer;
