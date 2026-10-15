import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { ReidentificationRiskRunModel } from '../../src/models/reidentificationRiskRun.model';
import { ReidentificationRiskResultModel } from '../../src/models/reidentificationRiskResult.model';
import { riskService } from '../../src/services/risk/risk.service';
import { AppError } from '../../src/utils/AppError';

describe('Re-Identification Risk Engine Adversarial & Security Tests', () => {
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  let orgIdStr: string;
  let docIdStr: string;
  let sampleFilePath: string;
  let hugeFilePath: string;
  let tamperedFilePath: string;

  beforeAll(async () => {
    await connectDatabase();

    const user = await User.create({
      email: `adv_${uniqueSuffix}@tenant.com`,
      normalizedEmail: `adv_${uniqueSuffix}@tenant.com`,
      passwordHash: 'hash',
      firstName: 'Adv',
      lastName: 'Test',
      role: 'ORG_ADMIN',
    });

    orgIdStr = new mongoose.Types.ObjectId().toString();

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });

    sampleFilePath = path.join(storageDir, `adv_doc_${uniqueSuffix}.pdf`);
    hugeFilePath = path.join(storageDir, `adv_huge_${uniqueSuffix}.pdf`);
    tamperedFilePath = path.join(storageDir, `adv_tamp_${uniqueSuffix}.pdf`);

    const pdfContent = '%PDF-1.4 1 0 obj << /Title (Adversarial Doc) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    await fs.promises.writeFile(hugeFilePath, pdfContent, 'binary');
    await fs.promises.writeFile(tamperedFilePath, pdfContent, 'binary');

    const checksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const doc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: user._id,
      originalFilename: `Adv_Doc_${uniqueSuffix}.pdf`,
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
      size: 55 * 1024 * 1024, // 55MB
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: hugeFilePath,
      checksum: 'dummy',
      status: 'EXTRACTED',
      isDeleted: false,
    });

    await expect(
      riskService.executeRiskAnalysis(hugeDoc._id.toString(), orgIdStr)
    ).rejects.toThrow(AppError);
  });

  test('Stale source protection rejects evaluation if storage file checksum fails validation', async () => {
    // Create doc with non-matching checksum
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
      riskService.executeRiskAnalysis(badDoc._id.toString(), orgIdStr)
    ).rejects.toThrow(AppError);
  });

  test('Cross-tenant access or non-existent document ID is rejected with DOCUMENT_NOT_FOUND', async () => {
    const wrongOrgId = new mongoose.Types.ObjectId().toString();
    await expect(
      riskService.executeRiskAnalysis(docIdStr, wrongOrgId)
    ).rejects.toThrow(AppError);
  });

  test('Zero Raw PII Security Audit: Database run and result records contain no raw PII values', async () => {
    const { run } = await riskService.executeRiskAnalysis(docIdStr, orgIdStr);

    const runRecord = await ReidentificationRiskRunModel.findOne({ riskRunId: run.riskRunId });
    const resultRecords = await ReidentificationRiskResultModel.find({ riskRunId: run.riskRunId });

    const runJson = JSON.stringify(runRecord?.toObject() || {});
    const resultsJson = JSON.stringify(resultRecords.map((r) => r.toObject()));

    // Verify raw PII strings (e.g., email address, ssn) are absent
    expect(runJson).not.toContain('john.doe@example.com');
    expect(runJson).not.toContain('123-45-6789');
    expect(resultsJson).not.toContain('john.doe@example.com');
    expect(resultsJson).not.toContain('123-45-6789');
  });
});
