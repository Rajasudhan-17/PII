import { Request, Response, NextFunction } from 'express';
import { verificationService } from '../services/verification/verification.service';
import { enqueueVerificationJob } from '../queues/verification.queue';

export class VerificationController {
  public executeVerification = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const { outputArtifactId, force, async: isAsync, verificationModelVersion } = req.body || {};
      const userObj = (req as unknown as { user?: { id?: string; userId?: string } }).user;
      const userId = userObj?.id || userObj?.userId;
      const requestId = (req as unknown as { id?: string }).id;

      if (isAsync || req.query.async === 'true') {
        const jobId = await enqueueVerificationJob({
          documentId,
          organizationId,
          outputArtifactId,
          force: Boolean(force),
          userId,
          requestId,
          verificationModelVersion,
        });

        res.status(202).json({
          success: true,
          data: {
            jobId,
            status: 'VERIFICATION_QUEUED',
            documentId,
            organizationId,
          },
        });
        return;
      }

      const { run, results } = await verificationService.executeVerification(documentId, organizationId, {
        outputArtifactId,
        force: Boolean(force),
        userId,
        requestId,
        verificationModelVersion,
      });

      res.status(200).json({
        success: true,
        data: {
          verificationRun: run,
          results,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getVerificationRuns = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const runs = await verificationService.getVerificationRuns(documentId, organizationId);

      res.status(200).json({
        success: true,
        data: {
          verificationRuns: runs,
          runs,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getVerificationResults = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const { run, results } = await verificationService.getVerificationResults(documentId, organizationId);

      res.status(200).json({
        success: true,
        data: {
          verificationRun: run,
          results,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

export const verificationController = new VerificationController();
