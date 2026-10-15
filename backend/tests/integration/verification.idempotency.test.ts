import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { VerificationRunModel } from '../../src/models/verificationRun.model';
import { verificationService } from '../../src/services/verification/verification.service';

describe('Verification Engine Idempotency Integration Tests', () => {
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  let orgIdStr: string;
  let docIdStr: string;
  let sampleFilePath: string;

  beforeAll(async () => {
    await connectDatabase();
    await VerificationRunModel.syncIndexes().catch(() => {});

    const user = await User.create({
      email: `ver_idemp_${uniqueSuffix}@tenant.com`,
      normalizedEmail: `ver_idemp_${uniqueSuffix}@tenant.com`,
      passwordHash: 'hash',
      firstName: 'VerIdemp',
      lastName: 'Test',
      role: 'ORG_ADMIN',
    });

    orgIdStr = new mongoose.Types.ObjectId().toString();

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `ver_idemp_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Title (Idempotency) >> stream (Content) endstream endobj %%EOF';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const checksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const doc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: user._id,
      originalFilename: `Ver_Idemp_Doc_${uniqueSuffix}.pdf`,
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

  test('Subsequent verification calls with identical parameters reuse existing run idempotently', async () => {
    const run1 = await verificationService.executeVerification(docIdStr, orgIdStr);
    const run2 = await verificationService.executeVerification(docIdStr, orgIdStr);

    expect(run1.run.verificationRunId).toBe(run2.run.verificationRunId);

    const count = await VerificationRunModel.countDocuments({
      organizationId: orgIdStr,
      documentId: docIdStr,
    });
    expect(count).toBe(1);
  });

  test('Passing force=true bypasses idempotency and creates a new active verification run', async () => {
    const run1 = await verificationService.executeVerification(docIdStr, orgIdStr);
    const runForced = await verificationService.executeVerification(docIdStr, orgIdStr, { force: true });

    expect(runForced.run.verificationRunId).not.toBe(run1.run.verificationRunId);
    expect(runForced.run.isLatestActive).toBe(true);

    const run1Updated = await VerificationRunModel.findOne({ verificationRunId: run1.run.verificationRunId });
    expect(run1Updated?.isLatestActive).toBe(false);
  });
});
