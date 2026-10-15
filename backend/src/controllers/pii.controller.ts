import { Request, Response, NextFunction } from 'express';
import { piiDetectionService } from '../services/pii/piiDetection.service';
import { enqueuePIIJob } from '../queues/pii.queue';
import { DocumentModel } from '../models/document.model';
import { AppError } from '../utils/AppError';

export class PIIController {
  /**
   * Triggers PII candidate detection for a document (versioned run architecture).
   */
  public triggerPIIDetection = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
      }

      const isAsync = req.query.async === 'true' || req.body?.async === true;
      const force = req.query.force === 'true' || req.body?.force === true;

      if (isAsync) {
        const document = await DocumentModel.findOne({
          _id: documentId,
          organizationId,
          isDeleted: false,
          deletedAt: null,
        });

        if (!document) {
          throw AppError.notFound('Document not found or has been deleted', 'DOCUMENT_NOT_FOUND');
        }

        const jobId = await enqueuePIIJob({
          documentId,
          organizationId,
          checksum: document.checksum,
          force,
          userId,
          requestId: req.id,
        });

        res.status(202).json({
          success: true,
          data: {
            documentId,
            organizationId,
            jobEnqueued: true,
            jobId,
            status: 'PII_DETECTION_QUEUED',
          },
        });
        return;
      }

      const { run, candidates } = await piiDetectionService.detectPIIForDocument(
        documentId,
        organizationId,
        { force }
      );

      res.status(200).json({
        success: true,
        data: {
          documentId,
          organizationId,
          detectionRunId: run.detectionRunId,
          runStatus: run.status,
          totalCandidates: candidates.length,
          candidates,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Retrieves detected PII candidates for a document (active run or specific runId).
   */
  public getCandidates = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const runId = req.query.runId as string | undefined;

      const candidates = await piiDetectionService.getCandidatesForDocument(
        documentId,
        organizationId,
        runId
      );

      res.status(200).json({
        success: true,
        data: {
          documentId,
          organizationId,
          totalCandidates: candidates.length,
          candidates,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Retrieves high-level PII detection summary statistics for a document.
   */
  public getDetectionSummary = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const runId = req.query.runId as string | undefined;

      const summary = await piiDetectionService.getDetectionSummary(
        documentId,
        organizationId,
        runId
      );

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Lists all versioned detection runs for a document.
   */
  public getDetectionRuns = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;

      const runs = await piiDetectionService.getDetectionRuns(documentId, organizationId);

      res.status(200).json({
        success: true,
        data: {
          documentId,
          organizationId,
          totalRuns: runs.length,
          runs,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Fetches details of a specific detection run by ID.
   */
  public getDetectionRunById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId, runId } = req.params;

      const run = await piiDetectionService.getDetectionRunById(
        documentId,
        organizationId,
        runId
      );

      res.status(200).json({
        success: true,
        data: run,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const piiController = new PIIController();
