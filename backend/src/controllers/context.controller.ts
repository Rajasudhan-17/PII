import { Request, Response, NextFunction } from 'express';
import { contextAnalysisService } from '../services/context/contextAnalysis.service';
import { AppError } from '../utils/AppError';

export class ContextController {
  public async triggerContextAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, documentId } = req.params;
      const { force } = req.body || {};
      const userId = (req as unknown as { user?: { userId: string } }).user?.userId;
      const requestId = (req as unknown as { id?: string }).id;

      const { run, results } = await contextAnalysisService.runContextAnalysis(documentId, organizationId, {
        force: Boolean(force),
        userId,
        requestId,
      });

      res.status(200).json({
        success: true,
        data: {
          contextAnalysisRunId: run.contextAnalysisRunId,
          status: run.status,
          candidateCount: run.candidateCount,
          processedCount: run.processedCount,
          resultsCount: results.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getContextRuns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, documentId } = req.params;
      const runs = await contextAnalysisService.getContextRuns(documentId, organizationId);

      res.status(200).json({
        success: true,
        data: { runs },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getContextRunById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, documentId, runId } = req.params;
      const runs = await contextAnalysisService.getContextRuns(documentId, organizationId);
      const targetRun = runs.find((r) => r.contextAnalysisRunId === runId);

      if (!targetRun) {
        throw AppError.notFound('Context analysis run not found', 'RUN_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: { run: targetRun },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getContextResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, documentId } = req.params;
      const runId = req.query.runId as string | undefined;

      const { run, results } = await contextAnalysisService.getContextResults(documentId, organizationId, runId);

      res.status(200).json({
        success: true,
        data: {
          run: run ? { contextAnalysisRunId: run.contextAnalysisRunId, status: run.status } : null,
          results,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getContextSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, documentId } = req.params;
      const summary = await contextAnalysisService.getContextSummary(documentId, organizationId);

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const contextController = new ContextController();
