import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { AppError } from '../../utils/AppError';
import { getConfig } from '../../config/env';
import { logger } from '../../utils/logger';

export interface StorageMetadata {
  size: number;
  mtime: Date;
}

export interface IStorageProvider {
  put(storageKey: string, source: string | Buffer | Readable): Promise<void>;
  getStream(storageKey: string): Promise<Readable>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
  metadata(storageKey: string): Promise<StorageMetadata>;
  getAbsolutePath(storageKey: string): string;
}

export class LocalFileStorage implements IStorageProvider {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    const configPath = customBaseDir || getConfig().STORAGE_PATH;
    this.baseDir = path.resolve(process.cwd(), configPath);
    this.ensureDirectoryExists(this.baseDir);
  }

  public getAbsolutePath(storageKey: string): string {
    return this.resolvePath(storageKey);
  }

  private resolvePath(storageKey: string): string {
    const absolutePath = path.resolve(this.baseDir, storageKey);

    // Verify absolutePath is strictly within baseDir
    const relative = path.relative(this.baseDir, absolutePath);
    const normalizedAbs = process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath;
    const normalizedBase = process.platform === 'win32' ? this.baseDir.toLowerCase() : this.baseDir;
    if (relative.startsWith('..') || path.isAbsolute(relative) || !normalizedAbs.startsWith(normalizedBase)) {
      logger.error({ storageKey, absolutePath, baseDir: this.baseDir }, 'Path traversal attempt detected in LocalFileStorage');
      throw new AppError('Invalid storage key or path traversal detected.', 400, 'PATH_TRAVERSAL_DETECTED');
    }

    return absolutePath;
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
    }
  }

  public async put(storageKey: string, source: string | Buffer | Readable): Promise<void> {
    const targetPath = this.resolvePath(storageKey);
    const parentDir = path.dirname(targetPath);
    this.ensureDirectoryExists(parentDir);

    if (typeof source === 'string') {
      // Source is a file path on local disk (e.g. quarantine file) -> copy or move
      await fs.promises.copyFile(source, targetPath);
    } else if (Buffer.isBuffer(source)) {
      await fs.promises.writeFile(targetPath, source);
    } else if (source instanceof Readable) {
      const writeStream = fs.createWriteStream(targetPath);
      await new Promise<void>((resolve, reject) => {
        source.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', (err) => {
          // Cleanup partial file on write error
          if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
          reject(err);
        });
      });
    } else {
      throw new AppError('Invalid storage source type.', 500, 'STORAGE_WRITE_ERROR');
    }
  }

  public async getStream(storageKey: string): Promise<Readable> {
    const targetPath = this.resolvePath(storageKey);
    if (!fs.existsSync(targetPath)) {
      throw new AppError('Document storage object not found.', 404, 'STORAGE_OBJECT_NOT_FOUND');
    }
    return fs.createReadStream(targetPath);
  }

  public async delete(storageKey: string): Promise<void> {
    const targetPath = this.resolvePath(storageKey);
    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath);
    }
  }

  public async exists(storageKey: string): Promise<boolean> {
    try {
      const targetPath = this.resolvePath(storageKey);
      await fs.promises.access(targetPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  public async metadata(storageKey: string): Promise<StorageMetadata> {
    const targetPath = this.resolvePath(storageKey);
    try {
      const stats = await fs.promises.stat(targetPath);
      return {
        size: stats.size,
        mtime: stats.mtime,
      };
    } catch {
      throw new AppError('Document storage object not found.', 404, 'STORAGE_OBJECT_NOT_FOUND');
    }
  }
}

// Global Singleton Instance
export const storageService = new LocalFileStorage();
