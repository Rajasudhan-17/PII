import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { ReidentificationRiskRunModel } from '../../src/models/reidentificationRiskRun.model';
import { riskService } from '../../src/services/risk/risk.service';

describe('Re-Identification Risk Engine Idempotency Tests', () => {
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  let orgIdStr: string;
  let docIdStr: string;
  let sampleFilePath: string;

  beforeAll(async () => {
    await connectDatabase();

    const user = await User.create({
      email: `idemp_${uniqueSuffix}@tenant.com`,
      normalizedEmail: `idemp_${uniqueSuffix}@tenant.com`,
      passwordHash: 'hash',
      firstName: 'Idemp',
      lastName: 'Test',
      role: 'ORG_ADMIN',
    });

    orgIdStr = new mongoose.Types.ObjectId().toString();

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `idemp_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Title (Idempotency Doc) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const checksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const doc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: user._id,
      originalFilename: `Idemp_Doc_${uniqueSuffix}.pdf`,
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

  test('Subsequent risk analysis calls with identical parameters reuse existing run idempotently', async () => {
    const run1 = await riskService.executeRiskAnalysis(docIdStr, orgIdStr);
    const run2 = await riskService.executeRiskAnalysis(docIdStr, orgIdStr);

    expect(run1.run.riskRunId).toBe(run2.run.riskRunId);

    const totalRunsInDb = await ReidentificationRiskRunModel.countDocuments({
      organizationId: orgIdStr,
      documentId: docIdStr,
    });
    expect(totalRunsInDb).toBe(1);
  });

  test('Passing force=true bypasses idempotency and creates a new risk run', async () => {
    const run1 = await riskService.executeRiskAnalysis(docIdStr, orgIdStr);
    const runForced = await riskService.executeRiskAnalysis(docIdStr, orgIdStr, { force: true });

    expect(runForced.run.riskRunId).not.toBe(run1.run.riskRunId);
    expect(runForced.run.isLatestActive).toBe(true);

    const run1Updated = await ReidentificationRiskRunModel.findOne({ riskRunId: run1.run.riskRunId });
    expect(run1Updated?.isLatestActive).toBe(false);
  });
});
