import { Request, Response } from 'express';
import { checkHealth, checkReadiness } from '../services/health.service';
import { metrics } from '../utils/metrics';

export const getHealth = (_req: Request, res: Response): void => {
  const healthReport = checkHealth();
  const statusCode = healthReport.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(healthReport);
};

export const getLiveness = (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    service: 'pii-backend',
    timestamp: new Date().toISOString(),
  });
};

export const getReadiness = (_req: Request, res: Response): void => {
  const readinessReport = checkReadiness();
  const statusCode = readinessReport.status === 'ready' ? 200 : 503;
  res.status(statusCode).json(readinessReport);
};

export const getMetrics = (req: Request, res: Response): void => {
  const metricsSecret = process.env.METRICS_AUTH_TOKEN;
  if (metricsSecret) {
    const authHeader = req.headers['authorization'];
    const tokenHeader = req.headers['x-metrics-token'] as string | undefined;
    const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const providedToken = tokenHeader || bearerToken;

    if (!providedToken || providedToken !== metricsSecret) {
      res.status(401).json({
        status: 'unauthorized',
        message: 'Metrics scraping requires valid authorization credentials.',
      });
      return;
    }
  }

  res.status(200).json(metrics.getMetricsSnapshot());
};
