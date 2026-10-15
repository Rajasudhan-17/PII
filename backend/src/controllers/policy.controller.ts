import { Request, Response, NextFunction } from 'express';
import { policyService } from '../services/policy/policy.service';

export class PolicyController {
  public async createPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId } = req.params;
      const userObj = (req as unknown as { user?: { id?: string; userId?: string } }).user;
      const userId = userObj?.id || userObj?.userId || '';

      const policy = await policyService.createPolicy(organizationId, userId, req.body);

      res.status(201).json({
        success: true,
        data: { policy },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId } = req.params;
      const policies = await policyService.getPolicies(organizationId);

      res.status(200).json({
        success: true,
        data: { policies },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getPolicyById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, policyId } = req.params;
      const versions = await policyService.getPolicyById(organizationId, policyId);

      res.status(200).json({
        success: true,
        data: { policyId, latestVersion: versions[0], versions },
      });
    } catch (err) {
      next(err);
    }
  }

  public async createPolicyVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, policyId } = req.params;
      const userObj = (req as unknown as { user?: { id?: string; userId?: string } }).user;
      const userId = userObj?.id || userObj?.userId || '';

      const newVersion = await policyService.createPolicyVersion(organizationId, userId, policyId, req.body);

      res.status(201).json({
        success: true,
        data: { policy: newVersion },
      });
    } catch (err) {
      next(err);
    }
  }

  public async triggerDecisionEvaluation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, documentId } = req.params;
      const { policyId, policyVersion, force } = req.body || {};
      const userObj = (req as unknown as { user?: { id?: string; userId?: string } }).user;
      const userId = userObj?.id || userObj?.userId;
      const requestId = (req as unknown as { id?: string }).id;

      const { run, results } = await policyService.evaluateDocumentDecisions(documentId, organizationId, {
        policyId,
        policyVersion,
        force: Boolean(force),
        userId,
        requestId,
      });

      res.status(200).json({
        success: true,
        data: {
          decisionRunId: run.decisionRunId,
          status: run.status,
          totalCandidates: run.totalCandidates,
          decisionsSummary: run.decisionsSummary,
          resultsCount: results.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getDecisionRuns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, documentId } = req.params;
      const runs = await policyService.getDecisionRuns(documentId, organizationId);

      res.status(200).json({
        success: true,
        data: { runs },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getDecisionResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId, documentId } = req.params;
      const runId = req.query.runId as string | undefined;

      const { run, results } = await policyService.getDecisionResults(documentId, organizationId, runId);

      res.status(200).json({
        success: true,
        data: {
          run: run
            ? {
                decisionRunId: run.decisionRunId,
                status: run.status,
                decisionsSummary: run.decisionsSummary,
              }
            : null,
          results,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const policyController = new PolicyController();
