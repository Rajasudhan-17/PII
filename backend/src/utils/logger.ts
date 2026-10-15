import pino from 'pino';
import { getConfig } from '../config/env';

const getLogLevel = (): string => {
  try {
    return getConfig().LOG_LEVEL;
  } catch {
    return process.env.LOG_LEVEL || 'info';
  }
};

export const logger = pino({
  level: getLogLevel(),
  base: {
    service: 'pii-backend',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'ssn',
      'creditCard',
      'pii',
      'payload',
      'rawText',
      'ocrContent',
      'documentContent',
    ],
    remove: true,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});
