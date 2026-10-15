import { Request, Response, NextFunction } from 'express';
import { extractionService } from '../services/extraction.service';
import { toNormalizedDocumentDTO } from '../dto/extraction.dto';

export class ExtractionController {
  public async triggerExtraction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.params.organizationId;
      const documentId = req.params.documentId;
      const userId = req.user?.id as string;
      const requestId = req.id;
      const ip = req.ip;

      const result = await extractionService.queueExtraction({
        organizationId,
        documentId,
        userId,
        requestId,
        ip,
      });

      res.status(202).json({
        message: 'Document extraction job enqueued successfully.',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async getExtractionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.params.organizationId;
      const documentId = req.params.documentId;

      const status = await extractionService.getExtractionStatus(organizationId, documentId);
      res.status(200).json(status);
    } catch (err) {
      next(err);
    }
  }

  public async getNormalizedContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.params.organizationId;
      const documentId = req.params.documentId;

      const normDoc = await extractionService.getNormalizedDocumentContent(organizationId, documentId);
      res.status(200).json({
        normalizedDocument: toNormalizedDocumentDTO(normDoc),
      });
    } catch (err) {
      next(err);
    }
  }
}

export const extractionController = new ExtractionController();
