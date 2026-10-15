import { Request, Response, NextFunction } from 'express';
import { riskService } from '../services/risk/risk.service';
import { enqueueRiskJob } from '../queues/risk.queue';

export class RiskController {
  public executeRiskAnalysis = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const { sanitizedArtifactId, force, async: isAsync, riskModelVersion } = req.body || {};
      const userObj = (req as unknown as { user?: { id?: string; userId?: string } }).user;
      const userId = userObj?.id || userObj?.userId;
      const requestId = (req as unknown as { id?: string }).id;

      if (isAsync || req.query.async === 'true') {
        const jobId = await enqueueRiskJob({
          documentId,
          organizationId,
          sanitizedArtifactId,
          force: Boolean(force),
          userId,
          requestId,
          riskModelVersion,
        });

        res.status(202).json({
          success: true,
          data: {
            jobId,
            status: 'RISK_ANALYSIS_QUEUED',
            documentId,
            organizationId,
          },
        });
        return;
      }

      const { run, results } = await riskService.executeRiskAnalysis(documentId, organizationId, {
        sanitizedArtifactId,
        force: Boolean(force),
        userId,
        requestId,
        riskModelVersion,
      });

      res.status(200).json({
        success: true,
        data: {
          riskRun: run,
          results,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getRiskRuns = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const runs = await riskService.getRiskRuns(documentId, organizationId);

      res.status(200).json({
        success: true,
        data: {
          riskRuns: runs,
          runs,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getRiskResults = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const { run, results } = await riskService.getRiskResults(documentId, organizationId);

      res.status(200).json({
        success: true,
        data: {
          riskRun: run,
          results,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

export const riskController = new RiskController();
