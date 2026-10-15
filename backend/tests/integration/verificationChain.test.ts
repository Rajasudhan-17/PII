import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { PIICandidateModel } from '../../src/models/piiCandidate.model';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';
import { sanitizationService } from '../../src/services/sanitization/sanitization.service';
import { riskService } from '../../src/services/risk/risk.service';
import { verificationService } from '../../src/services/verification/verification.service';

describe('Full End-to-End Pipeline Chain: Phase 07 -> Phase 13 Verification', () => {
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  let orgIdStr: string;
  let docIdStr: string;
  let sampleFilePath: string;

  beforeAll(async () => {
    await connectDatabase();

    const user = await User.create({
      email: `ver_chain_${uniqueSuffix}@tenant.com`,
      normalizedEmail: `ver_chain_${uniqueSuffix}@tenant.com`,
      passwordHash: 'hash',
      firstName: 'VerChain',
      lastName: 'Test',
      role: 'ORG_ADMIN',
    });

    orgIdStr = new mongoose.Types.ObjectId().toString();

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `ver_chain_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Author (Alice) /CreationDate (D:20250101000000Z) >> stream (Content) endstream endobj %%EOF';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const checksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const doc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: user._id,
      originalFilename: `Alice_Record_${uniqueSuffix}.pdf`,
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

    // Create Phase 07 Candidate
    await PIICandidateModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      documentId: doc._id,
      candidateId: `cand_${uniqueSuffix}_city`,
      detectionRunId: `det_run_${uniqueSuffix}`,
      type: PIIType.CITY,
      category: PIICategory.LOCATION_DATA,
      text: 'Chicago',
      normalizedValue: 'Chicago',
      confidence: 0.95,
      recognitionConfidence: 0.95,
      detectionScore: 0.95,
      severity: PIISeverity.MEDIUM,
      sensitivityScore: 0.6,
      evidence: ['PATTERN'],
      detectorName: 'CITY_DETECTOR',
      detectorType: 'PATTERN',
      decision: null,
      isMasked: false,
      isRedacted: false,
      location: { pageNumber: 1, startOffset: 10, endOffset: 17 },
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'b1' },
      detectionStatus: 'DETECTED',
    });
  });

  afterAll(async () => {
    if (sampleFilePath && fs.existsSync(sampleFilePath)) {
      await fs.promises.unlink(sampleFilePath).catch(() => {});
    }
  });

  test('Full pipeline chain executes end-to-end through Phase 11 Sanitization, Phase 12 Risk, and Phase 13 Independent Verification', async () => {
    // Phase 11 Metadata Sanitization
    const sanitRes = await sanitizationService.executeSanitization(docIdStr, orgIdStr);
    expect(sanitRes.run.status).toBe('COMPLETED');

    // Phase 12 Re-Identification Risk Analysis
    const riskRes = await riskService.executeRiskAnalysis(docIdStr, orgIdStr);
    expect(riskRes.run.status).toBe('COMPLETED');

    // Phase 13 Independent Verification Engine
    const verRes = await verificationService.executeVerification(docIdStr, orgIdStr);
    expect(verRes.run.status).toBe('COMPLETED');
    expect(verRes.run.overallStatus).toBe('VERIFIED');
    expect(verRes.run.isLatestActive).toBe(true);
    expect(verRes.results.length).toBeGreaterThan(0);
  });
});
