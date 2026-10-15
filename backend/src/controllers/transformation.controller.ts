import { Request, Response, NextFunction } from 'express';
import { transformationService } from '../services/transformation/transformation.service';
import { enqueueTransformationJob } from '../queues/transformation.queue';
import { storageService } from '../services/storage/storage.service';
import { AppError } from '../utils/AppError';

export class TransformationController {
  public executeTransformation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const { decisionRunId, operation, force, async: isAsync } = req.body || {};
      const userObj = (req as unknown as { user?: { id?: string; userId?: string } }).user;
      const userId = userObj?.id || userObj?.userId;
      const requestId = (req as unknown as { id?: string }).id;

      if (isAsync || req.query.async === 'true') {
        const jobId = await enqueueTransformationJob({
          documentId,
          organizationId,
          decisionRunId,
          operation,
          force: Boolean(force),
          userId,
          requestId,
        });

        res.status(202).json({
          success: true,
          data: {
            jobId,
            status: 'TRANSFORMATION_QUEUED',
            documentId,
            organizationId,
          },
        });
        return;
      }

      const { run, artifact, records } = await transformationService.executeTransformation(
        documentId,
        organizationId,
        {
          decisionRunId,
          operation,
          force: Boolean(force),
          userId,
          requestId,
        }
      );

      const runObj = run ? run.toObject() : null;
      if (runObj) {
        runObj.redactedCount = runObj.redactedCount ?? (runObj.operation === 'REDACTION' ? runObj.transformedCount : 0);
        runObj.maskedCount = runObj.maskedCount ?? (runObj.operation === 'MUTATION' ? runObj.transformedCount : 0);
        runObj.totalCandidatesEvaluated = runObj.totalCandidatesEvaluated ?? runObj.candidateCount;
      }

      res.status(200).json({
        success: true,
        data: {
          transformationRun: runObj,
          outputArtifact: artifact,
          records,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getTransformationRuns = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const runs = await transformationService.getTransformationRuns(documentId, organizationId);

      res.status(200).json({
        success: true,
        data: {
          transformationRuns: runs,
          runs,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getTransformationArtifacts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const runId = req.query.runId as string | undefined;

      const { run, artifact, records } = await transformationService.getTransformationArtifacts(
        documentId,
        organizationId,
        runId
      );

      const runObj = run ? run.toObject() : null;
      if (runObj) {
        runObj.redactedCount = runObj.redactedCount ?? (runObj.operation === 'REDACTION' ? runObj.transformedCount : 0);
        runObj.maskedCount = runObj.maskedCount ?? (runObj.operation === 'MUTATION' ? runObj.transformedCount : 0);
        runObj.totalCandidatesEvaluated = runObj.totalCandidatesEvaluated ?? runObj.candidateCount;
      }

      res.status(200).json({
        success: true,
        data: {
          transformationRun: runObj,
          outputArtifact: artifact,
          records,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public downloadTransformedArtifact = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { organizationId, documentId } = req.params;
      const runId = req.query.runId as string | undefined;

      const { artifact } = await transformationService.getTransformationArtifacts(
        documentId,
        organizationId,
        runId
      );

      if (!artifact) {
        throw new AppError('Transformed output artifact not found for this document.', 404, 'ARTIFACT_NOT_FOUND');
      }

      const stream = await storageService.getStream(artifact.storageKey);
      res.setHeader('Content-Type', artifact.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(artifact.originalFilename)}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Length', artifact.fileSize.toString());
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  };
}

export const transformationController = new TransformationController();
