import { Request, Response, NextFunction } from 'express';
import { sanitizationService } from '../services/sanitization/sanitization.service';
import { enqueueSanitizationJob } from '../queues/sanitization.queue';

export class SanitizationController {
  public executeSanitization = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const { sourceArtifactId, operation, policyOptions, force, async: isAsync } = req.body || {};
      const userObj = (req as unknown as { user?: { id?: string; userId?: string } }).user;
      const userId = userObj?.id || userObj?.userId;
      const requestId = (req as unknown as { id?: string }).id;

      if (isAsync || req.query.async === 'true') {
        const jobId = await enqueueSanitizationJob({
          documentId,
          organizationId,
          sourceArtifactId,
          operation,
          policyOptions,
          force: Boolean(force),
          userId,
          requestId,
        });

        res.status(202).json({
          success: true,
          data: {
            jobId,
            status: 'SANITIZATION_QUEUED',
            documentId,
            organizationId,
          },
        });
        return;
      }

      const { run, artifact, records } = await sanitizationService.executeSanitization(
        documentId,
        organizationId,
        {
          sourceArtifactId,
          operation,
          policyOptions,
          force: Boolean(force),
          userId,
          requestId,
        }
      );

      res.status(200).json({
        success: true,
        data: {
          sanitizationRun: run,
          outputArtifact: artifact,
          records,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getSanitizationRuns = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const runs = await sanitizationService.getSanitizationRuns(documentId, organizationId);

      res.status(200).json({
        success: true,
        data: {
          sanitizationRuns: runs,
          runs,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getSanitizationResults = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const runId = req.query.runId as string | undefined;

      const { run, artifact, records } = await sanitizationService.getSanitizationResults(
        documentId,
        organizationId,
        runId
      );

      res.status(200).json({
        success: true,
        data: {
          sanitizationRun: run,
          outputArtifact: artifact,
          records,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

export const sanitizationController = new SanitizationController();
