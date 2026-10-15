import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppError } from './AppError';

export const ALLOWED_EXTENSIONS_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/plain',
  // Phase 15 Advanced Modalities: Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  // Phase 15 Advanced Modalities: Video
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

export const ALLOWED_MIME_TYPES = new Set(Object.values(ALLOWED_EXTENSIONS_MAP));

/**
 * Validates image pixel bounds and dimensions to guard against memory exhaustion.
 */
export const validateImageDimensions = (width?: number, height?: number): void => {
  if (!width || !height) return;
  const maxDim = 10000;
  const maxPixels = 50000000;

  if (width > maxDim || height > maxDim) {
    throw new AppError(
      `Image dimensions (${width}x${height}) exceed maximum allowed dimension of ${maxDim}px.`,
      400,
      'IMAGE_DIMENSION_LIMIT_EXCEEDED'
    );
  }

  const totalPixels = width * height;
  if (totalPixels > maxPixels) {
    throw new AppError(
      `Image pixel count (${totalPixels}) exceeds maximum allowed pixel count of ${maxPixels}px.`,
      400,
      'IMAGE_DIMENSION_LIMIT_EXCEEDED'
    );
  }
};

/**
 * Validates archive entry count and uncompressed size to defend against decompression bombs.
 */
export const validateArchiveBounds = (entryCount: number, uncompressedSize: number): void => {
  const maxEntries = 1000;
  const maxSize = 50 * 1024 * 1024; // 50MB

  if (entryCount > maxEntries) {
    throw new AppError(
      `Archive entry count (${entryCount}) exceeds maximum allowed limit of ${maxEntries}.`,
      400,
      'ZIP_BOMB_DETECTED'
    );
  }

  if (uncompressedSize > maxSize) {
    throw new AppError(
      `Decompression bomb detected: total uncompressed size (${uncompressedSize} bytes) exceeds limit of ${maxSize} bytes.`,
      400,
      'ZIP_BOMB_DETECTED'
    );
  }
};

/**
 * Sanitizes original filename for safe display and logging.
 * Strips path separators, null bytes, control characters, and leading/trailing dots.
 */
export const sanitizeFilename = (rawFilename: string): string => {
  if (!rawFilename || typeof rawFilename !== 'string') {
    return 'unnamed_file';
  }

  // Take only basename (prevents path traversal)
  let clean = path.basename(rawFilename);

  // Remove null bytes and control characters
  // eslint-disable-next-line no-control-regex
  clean = clean.replace(/[\x00-\x1F\x7F]/g, '');

  // Remove dangerous path navigation sequences
  clean = clean.replace(/(\.\.[/\\])+/g, '');

  // Replace backslashes or slashes
  clean = clean.replace(/[/|\\]/g, '_');

  // Trim spaces and dots
  clean = clean.trim().replace(/^\.+/, '');

  if (!clean || clean.length === 0) {
    return 'unnamed_file';
  }

  // Truncate length to 255 characters max
  if (clean.length > 255) {
    const ext = path.extname(clean);
    const base = clean.substring(0, 250 - ext.length);
    clean = `${base}${ext}`;
  }

  return clean;
};

/**
 * Inspects header magic bytes of a file to detect actual content MIME type.
 */
export const detectMimeTypeFromMagicBytes = async (filePath: string, extension: string): Promise<string> => {
  const buffer = Buffer.alloc(16);
  let fd: fs.promises.FileHandle | null = null;
  try {
    fd = await fs.promises.open(filePath, 'r');
    const { bytesRead } = await fd.read(buffer, 0, 16, 0);
    await fd.close();
    fd = null;

    if (bytesRead < 4) {
      // Check if text/plain file with fewer than 4 bytes
      if (['txt', 'csv'].includes(extension.toLowerCase())) {
        return 'text/plain';
      }
      throw new AppError('File content too short for header validation.', 400, 'CORRUPTED_FILE_HEADER');
    }

    // PDF: %PDF (0x25 0x50 0x44 0x46)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'application/pdf';
    }

    // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }

    // JPEG: 0xFF 0xD8 0xFF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    // TIFF: 0x49 0x49 0x2A 0x00 (LE) or 0x4D 0x4D 0x00 0x2A (BE)
    if (
      (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
    ) {
      return 'image/tiff';
    }

    // Zip Container (DOCX / XLSX / PPTX): PK\x03\x04 (0x50 0x4B 0x03 0x04)
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      const extLower = extension.toLowerCase();
      if (extLower === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (extLower === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (extLower === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      return 'application/zip';
    }

    // Audio: FLAC (fLaC = 0x66 0x4C 0x61 0x43)
    if (buffer[0] === 0x66 && buffer[1] === 0x4c && buffer[2] === 0x61 && buffer[3] === 0x43) {
      return 'audio/flac';
    }

    // Audio: OGG (OggS = 0x4F 0x67 0x67 0x53)
    if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
      return 'audio/ogg';
    }

    // Audio: WAV (RIFF....WAVE)
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      bytesRead >= 12 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x41 &&
      buffer[10] === 0x56 &&
      buffer[11] === 0x45
    ) {
      return 'audio/wav';
    }

    // Audio: MP3 (ID3v2 = "ID3" or MPEG audio frame sync 0xFF 0xFB/F3/F2/E3)
    if (
      (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
    ) {
      return 'audio/mpeg';
    }

    // Video / Audio Container: ISO Base Media (MP4 / M4A / MOV) - "ftyp" at offset 4
    if (
      bytesRead >= 8 &&
      buffer[4] === 0x66 &&
      buffer[5] === 0x74 &&
      buffer[6] === 0x79 &&
      buffer[7] === 0x70
    ) {
      const extLower = extension.toLowerCase();
      if (extLower === 'm4a') return 'audio/mp4';
      if (extLower === 'mov') return 'video/quicktime';
      return 'video/mp4';
    }

    // Video: Matroska / WebM (EBML header: 0x1A 0x45 0xDF 0xA3)
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      if (extension.toLowerCase() === 'webm') {
        return 'video/webm';
      }
      return 'video/x-matroska';
    }

    // Plain Text / CSV check: All printable ASCII + standard whitespace (CR, LF, TAB)
    let isText = true;
    for (let i = 0; i < bytesRead; i++) {
      const byte = buffer[i];
      if (byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && (byte < 0x20 || byte > 0x7e)) {
        isText = false;
        break;
      }
    }
    if (isText) {
      return 'text/plain';
    }

    throw new AppError('Unrecognized or unsupported file binary header magic bytes.', 400, 'UNSUPPORTED_FILE_HEADER');
  } catch (err) {
    if (fd) {
      await fd.close();
    }
    if (err instanceof AppError) throw err;
    throw new AppError(`File magic bytes detection failed: ${(err as Error).message}`, 400, 'FILE_VALIDATION_FAILED');
  }
};

/**
 * Calculates SHA-256 streaming hash digest of a file.
 */
export const calculateFileChecksum = async (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(new AppError(`Checksum calculation failed: ${err.message}`, 500, 'CHECKSUM_FAILED')));
  });
};
