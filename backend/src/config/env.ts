import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'test') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
} else {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: 'PORT must be a valid port number (1-65535)',
    }),
  API_PREFIX: z.string().default('/api/v1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  HTR_SERVICE_URL: z.string().default('http://localhost:8000'),
  NER_SERVICE_URL: z.string().optional(),

  // Phase 02 Authentication & JWT Secrets
  JWT_ACCESS_SECRET: z
    .string()
    .min(16, 'JWT_ACCESS_SECRET must be at least 16 characters long')
    .default('super-secret-access-token-key-change-in-production-12345'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, 'JWT_REFRESH_SECRET must be at least 16 characters long')
    .default('super-secret-refresh-token-key-change-in-production-67890'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  MAX_FAILED_LOGIN_ATTEMPTS: z
    .string()
    .default('5')
    .transform((val) => parseInt(val, 10)),
  LOCKOUT_DURATION_MINUTES: z
    .string()
    .default('15')
    .transform((val) => parseInt(val, 10)),

  // Phase 04 File Ingestion & Storage Configuration
  MAX_UPLOAD_SIZE_BYTES: z
    .string()
    .default('10485760')
    .transform((val) => parseInt(val, 10)),
  STORAGE_PATH: z.string().default('./storage'),
  UPLOAD_RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('900000')
    .transform((val) => parseInt(val, 10)),
  UPLOAD_RATE_LIMIT_MAX: z
    .string()
    .default('20')
    .transform((val) => parseInt(val, 10)),

  // Phase 15 Production Hardening & Resource Governance
  SHUTDOWN_TIMEOUT_MS: z
    .string()
    .default('10000')
    .transform((val) => parseInt(val, 10)),
  MAX_MEDIA_DURATION_SECONDS: z
    .string()
    .default('3600')
    .transform((val) => parseInt(val, 10)),
  MAX_MEDIA_FRAME_COUNT: z
    .string()
    .default('300')
    .transform((val) => parseInt(val, 10)),
  MAX_UNCOMPRESSED_ARCHIVE_BYTES: z
    .string()
    .default('52428800')
    .transform((val) => parseInt(val, 10)),
  MAX_IMAGE_DIMENSION_PX: z
    .string()
    .default('10000')
    .transform((val) => parseInt(val, 10)),
  MAX_IMAGE_TOTAL_PIXELS: z
    .string()
    .default('50000000')
    .transform((val) => parseInt(val, 10)),
});

export type EnvConfig = z.infer<typeof envSchema>;

let parsedConfig: EnvConfig | null = null;

export const validateEnv = (customEnv?: Record<string, string | undefined>): EnvConfig => {
  const envToValidate = customEnv || process.env;
  const result = envSchema.safeParse(envToValidate);

  if (!result.success) {
    const missingOrInvalid = result.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ');
    if (!customEnv) {
      process.stderr.write(`FATAL: Environment configuration validation failed! Missing/Invalid: [${missingOrInvalid}]\n`);
    }
    throw new Error(`Environment validation failed: ${missingOrInvalid}`);
  }

  if (!customEnv) {
    parsedConfig = result.data;
  }
  return result.data;
};

export const getConfig = (): EnvConfig => {
  if (!parsedConfig) {
    return validateEnv();
  }
  return parsedConfig;
};
