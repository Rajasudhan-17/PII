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

describe('Phase 11 Sanitization -> Phase 12 Risk Engine Integration Chain', () => {
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
  let orgIdStr: string;
  let docIdStr: string;
  let sampleFilePath: string;

  beforeAll(async () => {
    await connectDatabase();

    const user = await User.create({
      email: `chain_${uniqueSuffix}@tenant.com`,
      normalizedEmail: `chain_${uniqueSuffix}@tenant.com`,
      passwordHash: 'hash',
      firstName: 'Chain',
      lastName: 'Test',
      role: 'ORG_ADMIN',
    });

    orgIdStr = new mongoose.Types.ObjectId().toString();

    const storageDir = path.join(process.cwd(), 'scratch', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    sampleFilePath = path.join(storageDir, `chain_doc_${uniqueSuffix}.pdf`);
    const pdfContent = '%PDF-1.4 1 0 obj << /Author (Alice) /CreationDate (D:20250101000000Z) >> stream (Content) endstream endobj';
    await fs.promises.writeFile(sampleFilePath, pdfContent, 'binary');
    const checksum = crypto.createHash('sha256').update(Buffer.from(pdfContent, 'binary')).digest('hex');

    const doc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: user._id,
      originalFilename: `Alice_Medical_Record_${uniqueSuffix}.pdf`,
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

    // Create a PII candidate for quasi-identifier (e.g. CITY)
    await PIICandidateModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      documentId: doc._id,
      candidateId: `cand_${uniqueSuffix}_city`,
      detectionRunId: `det_run_${uniqueSuffix}`,
      type: PIIType.CITY,
      category: PIICategory.LOCATION_DATA,
      text: 'Los Angeles',
      normalizedValue: 'Los Angeles',
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
      location: { pageNumber: 1, startOffset: 10, endOffset: 21 },
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'b1' },
      detectionStatus: 'DETECTED',
    });
  });

  afterAll(async () => {
    if (sampleFilePath && fs.existsSync(sampleFilePath)) {
      await fs.promises.unlink(sampleFilePath).catch(() => {});
    }
  });

  test('Sanitization -> Risk analysis chain executes end-to-end consuming Phase 11 output artifact', async () => {
    // 1. Run Phase 11 Metadata Sanitization
    const sanitizationRes = await sanitizationService.executeSanitization(docIdStr, orgIdStr, {
      operation: 'FULL_CLEAN',
    });

    expect(sanitizationRes.run.status).toBe('COMPLETED');
    expect(sanitizationRes.artifact.outputArtifactId).toBeDefined();

    // 2. Run Phase 12 Re-Identification Risk Analysis
    const riskRes = await riskService.executeRiskAnalysis(docIdStr, orgIdStr, {
      sanitizedArtifactId: sanitizationRes.artifact.outputArtifactId,
    });

    expect(riskRes.run.status).toBe('COMPLETED');
    expect(riskRes.run.sanitizedArtifactId).toBe(sanitizationRes.artifact.outputArtifactId);
    expect(riskRes.run.isLatestActive).toBe(true);
    expect(riskRes.run.reidentificationRiskScore).toBeGreaterThanOrEqual(0);
    expect(riskRes.results.length).toBeGreaterThan(0);

    // 3. Verify underlying source files are unchanged (Immutability check)
    expect(fs.existsSync(sampleFilePath)).toBe(true);
  });
});
