import { RotationAngle } from '../services/ocr/coordinateMapper';

export interface ProcessOCRRequestDto {
  isHandwriting?: boolean;
  language?: string;
  rotation?: RotationAngle;
  force?: boolean;
}

export interface OCRJobEnqueuedResponseDto {
  success: boolean;
  data: {
    documentId: string;
    organizationId: string;
    jobEnqueued: boolean;
    status: string;
  };
}

export interface OCRStatusResponseDto {
  success: boolean;
  data: {
    documentId: string;
    organizationId: string;
    documentStatus: string;
    ocrStatus: string;
    checksum: string;
    ocrBlockCount: number;
    averageConfidence: number | null;
    recognitionMethods: string[];
    extractedAt: Date | null;
    warnings: Array<{ code: string; message: string; elementRef?: string }>;
    metadata?: Record<string, unknown>;
  };
}
