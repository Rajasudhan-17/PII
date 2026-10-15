import { Request, Response, NextFunction } from 'express';
import { ocrService } from '../services/ocr/ocr.service';
import { ProcessOCRRequestDto } from '../dto/ocr.dto';
import { AppError } from '../utils/AppError';

export class OCRController {
  /**
   * Triggers OCR or HTR processing for a document asset (asynchronous queue or synchronous execution).
   */
  public triggerOCR = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const body: ProcessOCRRequestDto & { sync?: boolean } = req.body || {};
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
      }

      const isSync = req.query.sync === 'true' || body.sync === true;

      if (isSync) {
        const result = await ocrService.processDocumentOCR(documentId, organizationId, {
          isHandwriting: body.isHandwriting,
          language: body.language,
          rotation: body.rotation,
          force: body.force,
          userId,
          requestId: req.id,
          ip: req.ip,
        });

        res.status(200).json({
          success: true,
          data: {
            documentId,
            organizationId,
            status: result.status,
            extractedAt: result.extractedAt,
            blockCount: result.blocks.length,
            warnings: result.warnings,
          },
        });
        return;
      }

      const enqueued = await ocrService.queueOCR({
        organizationId,
        documentId,
        userId,
        isHandwriting: body.isHandwriting,
        language: body.language,
        rotation: body.rotation,
        requestId: req.id,
        ip: req.ip,
      });

      res.status(202).json({
        success: true,
        data: {
          documentId,
          organizationId,
          jobEnqueued: enqueued.jobEnqueued,
          status: enqueued.status,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Fetches OCR status, block count, and aggregate confidence metrics for a document.
   */
  public getOCRStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;

      const status = await ocrService.getOCRStatus(documentId, organizationId);

      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const ocrController = new OCRController();
