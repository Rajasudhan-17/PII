import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { VerificationRunModel } from '../../src/models/verificationRun.model';
import { VerificationResultModel } from '../../src/models/verificationResult.model';
import { verificationService } from '../../src/services/verification/verification.service';
import { AppError } from '../../src/utils/AppError';

describe('Verification Engine Adversarial & Security Integration Tests', () => {
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  let orgIdStr: string;
  let docIdStr: string;
  let sampleFilePath: string;
  let hugeFilePath: string;
  let tamperedFilePath: string;

  beforeAll(async () => {
    await connectDatabase();

    const user = await User.create({
      email: `ver_adv_${uniqueSuffix}@tenant.com`,
      normalizedEmail: `ver_adv_${uniqueSuffix}@tenant.com`,
      passwordHash: 'hash',
      firstName: 'VerAdv',
      lastName: 'Test',
      role: 'ORG_ADMIN',
    });

    orgIdStr = new mongoose.Types.ObjectId().toString();

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });

    sampleFilePath = path.join(storageDir, `ver_adv_doc_${uniqueSuffix}.pdf`);
    hugeFilePath = path.join(storageDir, `ver_adv_huge_${uniqueSuffix}.pdf`);
    tamperedFilePath = path.join(storageDir, `ver_adv_tamp_${uniqueSuffix}.pdf`);

    const pdfContent = '%PDF-1.4 1 0 obj << /Title (Adversarial) >> stream (Content) endstream endobj %%EOF';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    await fs.promises.writeFile(hugeFilePath, pdfContent, 'binary');
    await fs.promises.writeFile(tamperedFilePath, pdfContent, 'binary');

    const checksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const doc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: user._id,
      originalFilename: `Ver_Adv_Doc_${uniqueSuffix}.pdf`,
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
    for (const fp of [sampleFilePath, hugeFilePath, tamperedFilePath]) {
      if (fp && fs.existsSync(fp)) {
        await fs.promises.unlink(fp).catch(() => {});
      }
    }
  });

  test('Oversized document (>50MB) is rejected with RESOURCE_LIMIT_EXCEEDED error', async () => {
    const hugeDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: new mongoose.Types.ObjectId(),
      originalFilename: `Huge_${uniqueSuffix}.pdf`,
      size: 55 * 1024 * 1024,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: hugeFilePath,
      checksum: 'dummy',
      status: 'EXTRACTED',
      isDeleted: false,
    });

    await expect(
      verificationService.executeVerification(hugeDoc._id.toString(), orgIdStr)
    ).rejects.toThrow(AppError);
  });

  test('Stale source protection rejects evaluation if storage file checksum fails validation', async () => {
    const badDoc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: new mongoose.Types.ObjectId(),
      originalFilename: `Tampered_${uniqueSuffix}.pdf`,
      size: 500,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: tamperedFilePath,
      checksum: 'bad_checksum_1234567890abcdef',
      status: 'EXTRACTED',
      isDeleted: false,
    });

    await expect(
      verificationService.executeVerification(badDoc._id.toString(), orgIdStr)
    ).rejects.toThrow(AppError);
  });

  test('Cross-tenant access is rejected with DOCUMENT_NOT_FOUND', async () => {
    const wrongOrgId = new mongoose.Types.ObjectId().toString();
    await expect(
      verificationService.executeVerification(docIdStr, wrongOrgId)
    ).rejects.toThrow(AppError);
  });

  test('Zero Raw PII Security Audit: Verification database records contain no raw PII values', async () => {
    const { run } = await verificationService.executeVerification(docIdStr, orgIdStr);

    const runRecord = await VerificationRunModel.findOne({ verificationRunId: run.verificationRunId });
    const resultRecords = await VerificationResultModel.find({ verificationRunId: run.verificationRunId });

    const runJson = JSON.stringify(runRecord?.toObject() || {});
    const resultsJson = JSON.stringify(resultRecords.map((r) => r.toObject()));

    expect(runJson).not.toContain('john.doe@example.com');
    expect(runJson).not.toContain('123-45-6789');
    expect(resultsJson).not.toContain('john.doe@example.com');
    expect(resultsJson).not.toContain('123-45-6789');
  });
});
