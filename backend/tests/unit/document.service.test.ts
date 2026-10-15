import fs from 'fs';
import path from 'path';
import { LocalFileStorage } from '../../src/services/storage/storage.service';
import {
  sanitizeFilename,
  detectMimeTypeFromMagicBytes,
  calculateFileChecksum,
} from '../../src/utils/fileValidation';
import { AppError } from '../../src/utils/AppError';

describe('Phase 04 Storage & Validation Unit Tests', () => {
  const testStorageDir = path.resolve(process.cwd(), 'storage_test_tmp');
  let storage: LocalFileStorage;

  beforeAll(() => {
    storage = new LocalFileStorage(testStorageDir);
  });

  afterAll(async () => {
    if (fs.existsSync(testStorageDir)) {
      await fs.promises.rm(testStorageDir, { recursive: true, force: true });
    }
  });

  describe('Filename Sanitization', () => {
    test('sanitizes dangerous path traversal sequences', () => {
      expect(sanitizeFilename('../../secret.txt')).toBe('secret.txt');
      expect(sanitizeFilename('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
      expect(sanitizeFilename('/etc/passwd')).toBe('passwd');
    });

    test('strips null bytes and control characters', () => {
      expect(sanitizeFilename('file\x00name.pdf')).toBe('filename.pdf');
      expect(sanitizeFilename('test\x1Ffile.png')).toBe('testfile.png');
    });

    test('truncates extremely long filenames safely', () => {
      const longName = 'a'.repeat(300) + '.pdf';
      const clean = sanitizeFilename(longName);
      expect(clean.length).toBeLessThanOrEqual(255);
      expect(clean.endsWith('.pdf')).toBe(true);
    });

    test('returns default filename on empty or invalid input', () => {
      expect(sanitizeFilename('')).toBe('unnamed_file');
      expect(sanitizeFilename('   ')).toBe('unnamed_file');
    });
  });

  describe('Path Traversal Defense in Storage Service', () => {
    test('rejects storage keys attempting path traversal outside base directory', async () => {
      await expect(storage.getStream('../../etc/passwd')).rejects.toThrow(AppError);
      await expect(storage.delete('..\\..\\windows\\system32')).rejects.toThrow(AppError);
    });

    test('successfully writes and reads files inside base storage directory', async () => {
      const testKey = 'test/doc1.txt';
      await storage.put(testKey, Buffer.from('hello world'));

      const exists = await storage.exists(testKey);
      expect(exists).toBe(true);

      const meta = await storage.metadata(testKey);
      expect(meta.size).toBe(11);

      await storage.delete(testKey);
      const existsAfter = await storage.exists(testKey);
      expect(existsAfter).toBe(false);
    });
  });

  describe('Magic Bytes MIME Inspector', () => {
    const tmpDir = path.resolve(process.cwd(), 'tmp_magic_bytes_test');

    beforeAll(() => {
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterAll(async () => {
      if (fs.existsSync(tmpDir)) await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    test('detects PDF magic bytes (%PDF)', async () => {
      const filePath = path.join(tmpDir, 'test.pdf');
      await fs.promises.writeFile(filePath, Buffer.from('%PDF-1.5 test content'));

      const mime = await detectMimeTypeFromMagicBytes(filePath, 'pdf');
      expect(mime).toBe('application/pdf');
    });

    test('detects PNG magic bytes', async () => {
      const filePath = path.join(tmpDir, 'test.png');
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      await fs.promises.writeFile(filePath, pngHeader);

      const mime = await detectMimeTypeFromMagicBytes(filePath, 'png');
      expect(mime).toBe('image/png');
    });

    test('detects JPEG magic bytes', async () => {
      const filePath = path.join(tmpDir, 'test.jpg');
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      await fs.promises.writeFile(filePath, jpegHeader);

      const mime = await detectMimeTypeFromMagicBytes(filePath, 'jpg');
      expect(mime).toBe('image/jpeg');
    });

    test('detects plain text file', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(filePath, 'Hello plain text file\nSecond line');

      const mime = await detectMimeTypeFromMagicBytes(filePath, 'txt');
      expect(mime).toBe('text/plain');
    });

    test('rejects binary file spoofed as PDF', async () => {
      const filePath = path.join(tmpDir, 'spoofed.pdf');
      const fakeHeader = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
      await fs.promises.writeFile(filePath, fakeHeader);

      await expect(detectMimeTypeFromMagicBytes(filePath, 'pdf')).rejects.toThrow(AppError);
    });
  });

  describe('SHA-256 Checksum Calculation', () => {
    const tmpDir = path.resolve(process.cwd(), 'tmp_hash_test');

    beforeAll(() => {
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterAll(async () => {
      if (fs.existsSync(tmpDir)) await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    test('calculates exact SHA-256 hash digest of a file', async () => {
      const filePath = path.join(tmpDir, 'hash_test.txt');
      const content = 'Test string for checksum calculation';
      await fs.promises.writeFile(filePath, content);

      const checksum = await calculateFileChecksum(filePath);
      expect(checksum).toHaveLength(64); // 64 hex characters for SHA-256
    });
  });
});
