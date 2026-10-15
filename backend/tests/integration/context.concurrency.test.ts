import mongoose from 'mongoose';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { DocumentModel } from '../../src/models/document.model';
import { NormalizedDocumentModel } from '../../src/models/normalizedDocument.model';
import { DetectionRunModel } from '../../src/models/detectionRun.model';
import { PIICandidateModel } from '../../src/models/piiCandidate.model';
import { ContextAnalysisRunModel } from '../../src/models/contextAnalysisRun.model';
import { ContextResultModel } from '../../src/models/contextResult.model';
import { contextAnalysisService } from '../../src/services/context/contextAnalysis.service';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';

describe('Context Analysis Concurrency Integration Tests', () => {
  let orgId: string;
  let docId: string;
  let userId: string;

  beforeAll(async () => {
    await connectDatabase();
    await ContextAnalysisRunModel.syncIndexes().catch(() => {});

    const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
    const email = `cx_conc_${uniqueSuffix}@example.com`;
    const user = await User.create({
      email,
      normalizedEmail: email.toLowerCase(),
      passwordHash: 'hashed_password_123',
      firstName: 'Concurrency',
      lastName: 'Tester',
      role: 'ORG_ADMIN',
    });
    userId = user._id.toString();

    const orgName = `Context Concurrency Org ${uniqueSuffix}`;
    const org = await Organization.create({
      name: orgName,
      normalizedName: orgName.toLowerCase(),
      createdBy: user._id,
      slug: `cx-conc-org-${uniqueSuffix}`,
    });
    orgId = org._id.toString();

    const doc = await DocumentModel.create({
      organizationId: org._id,
      uploadedBy: user._id,
      originalFilename: 'conc_sample.pdf',
      size: 1024,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: `org_${orgId}/conc_${uniqueSuffix}.pdf`,
      checksum: `sha256_conc_${uniqueSuffix}`,
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docId = doc._id.toString();

    await NormalizedDocumentModel.create({
      documentId: doc._id,
      organizationId: org._id,
      checksum: doc.checksum,
      format: 'pdf',
      schemaVersion: '1.0.0',
      extractorVersion: '1.0.0',
      status: 'COMPLETE',
      pages: [{ pageNumber: 1, blockCount: 1 }],
      blocks: [
        {
          blockId: 'blk_conc_1',
          type: 'PARAGRAPH',
          text: 'Name: Alice. Phone: +1-555-0199.',
          pageNumber: 1,
          readingOrderIndex: 0,
          startOffset: 0,
          endOffset: 32,
          provenance: { documentId: docId, organizationId: orgId, pageNumber: 1, blockId: 'blk_conc_1' },
        },
      ],
      tables: [],
    });

    const detRunId = `det_run_conc_${uniqueSuffix}`;
    await DetectionRunModel.create({
      detectionRunId: detRunId,
      organizationId: org._id,
      documentId: doc._id,
      documentChecksum: doc.checksum,
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_conc',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
    });

    await PIICandidateModel.create({
      candidateId: `cand_conc_1_${uniqueSuffix}`,
      detectionRunId: detRunId,
      documentId: doc._id,
      organizationId: org._id,
      type: PIIType.PHONE_NUMBER,
      category: PIICategory.CONTACT_INFORMATION,
      text: '+1-555-0199',
      normalizedValue: '+15550199',
      confidence: 0.9,
      detectionScore: 0.9,
      severity: PIISeverity.MEDIUM,
      sensitivityScore: 0.7,
      evidence: ['REGEX_MATCH'],
      detectorName: 'PhoneDetector',
      detectorType: 'DETERMINISTIC',
      decision: null,
      location: { startOffset: 20, endOffset: 32, blockId: 'blk_conc_1', pageNumber: 1 },
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_conc_1' },
    });
  }, 30000);

  afterAll(async () => {
    await ContextResultModel.deleteMany({});
    await ContextAnalysisRunModel.deleteMany({});
    await PIICandidateModel.deleteMany({});
    await DetectionRunModel.deleteMany({});
    await NormalizedDocumentModel.deleteMany({});
    await DocumentModel.deleteMany({});
    await Organization.deleteMany({});
    await User.deleteMany({});
  });

  test('should guarantee exactly 1 active context run when 10 simultaneous requests trigger analysis', async () => {
    const promises = Array.from({ length: 10 }).map(() =>
      contextAnalysisService.runContextAnalysis(docId, orgId, { force: true, userId })
    );

    const results = await Promise.all(promises);
    expect(results.length).toBe(10);

    const activeRuns = await ContextAnalysisRunModel.find({
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: new mongoose.Types.ObjectId(docId),
      isLatestActive: true,
    });

    expect(activeRuns.length).toBe(1);
  });
});
