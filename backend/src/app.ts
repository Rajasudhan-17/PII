import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import { notFoundMiddleware } from './middleware/notFound';
import routes from './routes';
import { getConfig } from './config/env';

export const createApp = (): Express => {
  const app: Express = express();
  const config = getConfig();

  // Security HTTP headers
  app.use(helmet());

  // Disable x-powered-by to prevent technology stack disclosure
  app.disable('x-powered-by');

  // CORS configuration
  app.use(
    cors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'x-request-id',
        'x-organization-id',
        'X-Organization-Id',
        'x-metrics-token',
        'X-Metrics-Token',
      ],
      credentials: true,
    })
  );

  // Cookie parser
  app.use(cookieParser());

  // JSON request body parser with strict size limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request ID middleware
  app.use(requestIdMiddleware);

  // Mount API & Health routes
  app.use('/health', routes); // Top-level health check endpoint
  app.use(config.API_PREFIX, routes); // API-prefixed routes (e.g. /api/v1/auth/login)

  // 404 Not Found Middleware
  app.use(notFoundMiddleware);

  // Centralized Error Handling Middleware
  app.use(errorHandlerMiddleware);

  return app;
};
