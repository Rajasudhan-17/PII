import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { riskService } from '../../src/services/risk/risk.service';

describe('Re-Identification Risk Engine Concurrency & Race Tests', () => {
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  let orgIdStr: string;
  let docIdStr: string;
  let sampleFilePath: string;

  beforeAll(async () => {
    await connectDatabase();

    const user = await User.create({
      email: `conc_${uniqueSuffix}@tenant.com`,
      normalizedEmail: `conc_${uniqueSuffix}@tenant.com`,
      passwordHash: 'hash',
      firstName: 'Conc',
      lastName: 'Test',
      role: 'ORG_ADMIN',
    });

    orgIdStr = new mongoose.Types.ObjectId().toString();

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `conc_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Title (Concurrency Test) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const checksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const doc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: user._id,
      originalFilename: `Conc_Doc_${uniqueSuffix}.pdf`,
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

  test('Concurrent risk analysis executions settle gracefully without uncaught duplicate key errors', async () => {
    const promises = [
      riskService.executeRiskAnalysis(docIdStr, orgIdStr, { force: true }),
      riskService.executeRiskAnalysis(docIdStr, orgIdStr, { force: true }),
      riskService.executeRiskAnalysis(docIdStr, orgIdStr, { force: true }),
    ];

    const results = await Promise.allSettled(promises);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThan(0);
    fulfilled.forEach((f) => {
      const val = (f as PromiseFulfilledResult<Awaited<ReturnType<typeof riskService.executeRiskAnalysis>>>).value;
      expect(val.run).toBeDefined();
      expect(val.run.status).toBe('COMPLETED');
    });
  });
});
