import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { verificationService } from '../../src/services/verification/verification.service';

describe('Verification Engine Concurrency & Race Tests', () => {
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  let orgIdStr: string;
  let docIdStr: string;
  let sampleFilePath: string;

  beforeAll(async () => {
    await connectDatabase();

    const user = await User.create({
      email: `ver_conc_${uniqueSuffix}@tenant.com`,
      normalizedEmail: `ver_conc_${uniqueSuffix}@tenant.com`,
      passwordHash: 'hash',
      firstName: 'VerConc',
      lastName: 'Test',
      role: 'ORG_ADMIN',
    });

    orgIdStr = new mongoose.Types.ObjectId().toString();

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `ver_conc_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Title (Concurrency) >> stream (Content) endstream endobj %%EOF';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const checksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const doc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: user._id,
      originalFilename: `Ver_Conc_Doc_${uniqueSuffix}.pdf`,
      size: pdfContent.length,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: sampleFilePath,
      checksum,
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docIdStr = doc._id.toString();
  });

  afterAll(async () => {
    if (sampleFilePath && fs.existsSync(sampleFilePath)) {
      await fs.promises.unlink(sampleFilePath).catch(() => {});
    }
  });

  test('Concurrent verification requests settle gracefully without uncaught duplicate key errors', async () => {
    const promises = [
      verificationService.executeVerification(docIdStr, orgIdStr, { force: true }),
      verificationService.executeVerification(docIdStr, orgIdStr, { force: true }),
      verificationService.executeVerification(docIdStr, orgIdStr, { force: true }),
    ];

    const results = await Promise.allSettled(promises);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThan(0);
    fulfilled.forEach((f) => {
      const val = (f as PromiseFulfilledResult<Awaited<ReturnType<typeof verificationService.executeVerification>>>).value;
      expect(val.run).toBeDefined();
      expect(val.run.status).toBe('COMPLETED');
    });
  });
});
