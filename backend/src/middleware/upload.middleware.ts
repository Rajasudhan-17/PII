import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config/env';
import { AppError } from '../utils/AppError';
import { logAuthAuditEvent } from '../services/audit.service';

const getQuarantineDir = (): string => {
  const baseStorage = path.resolve(process.cwd(), getConfig().STORAGE_PATH);
  const quarantineDir = path.join(baseStorage, 'quarantine');
  if (!fs.existsSync(quarantineDir)) {
    fs.mkdirSync(quarantineDir, { recursive: true, mode: 0o755 });
  }
  return quarantineDir;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getQuarantineDir());
  },
  filename: (_req, _file, cb) => {
    // Generate secure random filename for quarantine isolation
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `quarantine-${uniqueSuffix}.tmp`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: getConfig().MAX_UPLOAD_SIZE_BYTES,
    files: 1, // Only 1 file per upload request
  },
}).single('file');

export const singleFileUploadMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  upload(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          logAuthAuditEvent({
            event: 'DOCUMENT_UPLOAD_REJECTED',
            userId: req.user?.id,
            organizationId: req.tenantContext?.organizationId,
            requestId: req.id,
            ip: req.ip,
            outcome: 'DENIED',
            reason: 'FILE_SIZE_EXCEEDS_MAX_LIMIT',
          });
          return next(
            new AppError(
              `File upload size exceeds the maximum allowed limit of ${getConfig().MAX_UPLOAD_SIZE_BYTES} bytes.`,
              413,
              'PAYLOAD_TOO_LARGE'
            )
          );
        }
        return next(new AppError(`File upload error: ${err.message}`, 400, 'BAD_REQUEST'));
      }
      return next(err);
    }

    if (!req.file) {
      return next(new AppError('No upload file provided in multipart body field "file".', 400, 'MISSING_UPLOAD_FILE'));
    }

    next();
  });
};
