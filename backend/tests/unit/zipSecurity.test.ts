import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import mongoose from 'mongoose';
import { DocxExtractor } from '../../src/services/extractors/docx.extractor';
import { IDocument } from '../../src/models/document.model';

const mockDocument = (): IDocument =>
  ({
    _id: new mongoose.Types.ObjectId(),
    organizationId: new mongoose.Types.ObjectId(),
    uploadedBy: new mongoose.Types.ObjectId(),
    originalFilename: 'malicious.docx',
    size: 1024,
    declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
    storageKey: 'orgs/123/docs/malicious.docx',
    status: 'READY',
    checksum: 'a1b2c3d4e5f6',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as IDocument);

describe('Zip Security Unit Tests (Zip Bomb & Path Traversal)', () => {
  const tmpDir = path.resolve(process.cwd(), 'storage/test_zip_security_tmp');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(tmpDir)) {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test('rejects DOCX zip entry attempting path traversal outside archive', async () => {
    const zip = new AdmZip();
    zip.addFile('word/document.xml', Buffer.from('<w:document></w:document>'));
    zip.addFile('entry.txt', Buffer.from('content'));

    const entries = zip.getEntries();
    const traversalEntry = entries.find((e) => e.entryName === 'entry.txt');
    if (traversalEntry) {
      traversalEntry.entryName = '../../etc/passwd';
    }

    const zipPath = path.join(tmpDir, 'traversal.docx');
    zip.writeZip(zipPath);

    const extractor = new DocxExtractor();
    const doc = mockDocument();

    await expect(extractor.extract(doc, zipPath)).rejects.toThrow('Path traversal attempt detected in DOCX zip entry.');
  });
});
