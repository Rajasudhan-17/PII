import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { PIICandidateModel } from '../../src/models/piiCandidate.model';
import { ReidentificationRiskResultModel } from '../../src/models/reidentificationRiskResult.model';
import { riskService } from '../../src/services/risk/risk.service';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';

describe('Residual Identifier Provenance Unit & Integration Tests', () => {
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  let orgIdStr: string;
  let docIdStr: string;
  let sampleFilePath: string;

  beforeAll(async () => {
    await connectDatabase();

    const user = await User.create({
      email: `prov_${uniqueSuffix}@tenant.com`,
      normalizedEmail: `prov_${uniqueSuffix}@tenant.com`,
      passwordHash: 'hash',
      firstName: 'Prov',
      lastName: 'Test',
      role: 'ORG_ADMIN',
    });

    orgIdStr = new mongoose.Types.ObjectId().toString();

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `prov_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Title (Provenance Doc) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const checksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const doc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: user._id,
      originalFilename: `Prov_Doc_${uniqueSuffix}.pdf`,
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

    // Create upstream direct identifier candidate
    await PIICandidateModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      documentId: doc._id,
      candidateId: `cand_${uniqueSuffix}_email`,
      detectionRunId: `det_run_${uniqueSuffix}`,
      type: PIIType.EMAIL_ADDRESS,
      category: PIICategory.CONTACT_INFORMATION,
      text: 'john.smith@secret.org',
      normalizedValue: 'john.smith@secret.org',
      confidence: 0.99,
      recognitionConfidence: 0.99,
      detectionScore: 0.99,
      severity: PIISeverity.HIGH,
      sensitivityScore: 0.85,
      evidence: ['PATTERN'],
      detectorName: 'EMAIL_DETECTOR',
      detectorType: 'PATTERN',
      decision: null,
      isMasked: false,
      isRedacted: false,
      location: { pageNumber: 1, startOffset: 12, endOffset: 34 },
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'b1' },
      detectionStatus: 'DETECTED',
    });
  });

  afterAll(async () => {
    if (sampleFilePath && fs.existsSync(sampleFilePath)) {
      await fs.promises.unlink(sampleFilePath).catch(() => {});
    }
  });

  test('Direct identifier signals record explicit provenanceSource and zero raw PII values', async () => {
    const { run } = await riskService.executeRiskAnalysis(docIdStr, orgIdStr);

    const directResults = await ReidentificationRiskResultModel.find({
      riskRunId: run.riskRunId,
      signalType: 'DIRECT_IDENTIFIER_SIGNAL',
    });

    expect(directResults.length).toBeGreaterThan(0);
    const directRes = directResults[0];

    expect(directRes.provenance).toBeDefined();
    expect(directRes.provenance?.provenanceSource).toBe('UPSTREAM_DETECTION_PROVENANCE');

    // Immutability & Zero PII audit invariant check
    const resJson = JSON.stringify(directRes.toObject());
    expect(resJson).not.toContain('john.smith@secret.org');
  });
});
