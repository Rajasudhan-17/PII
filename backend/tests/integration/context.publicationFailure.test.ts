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

describe('Context Analysis Active Publication Failure Recovery Integration Tests', () => {
  let orgId: string;
  let docId: string;
  let userId: string;

  beforeAll(async () => {
    await connectDatabase();

    const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
    const email = `cx_failrec_${uniqueSuffix}@example.com`;
    const user = await User.create({
      email,
      normalizedEmail: email.toLowerCase(),
      passwordHash: 'hashed_password_123',
      firstName: 'Failure',
      lastName: 'Recovery',
      role: 'ORG_ADMIN',
    });
    userId = user._id.toString();

    const orgName = `Context FailRec Org ${uniqueSuffix}`;
    const org = await Organization.create({
      name: orgName,
      normalizedName: orgName.toLowerCase(),
      createdBy: user._id,
      slug: `cx-failrec-org-${uniqueSuffix}`,
    });
    orgId = org._id.toString();

    const doc = await DocumentModel.create({
      organizationId: org._id,
      uploadedBy: user._id,
      originalFilename: 'failrec_sample.pdf',
      size: 1024,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: `org_${orgId}/failrec_${uniqueSuffix}.pdf`,
      checksum: `sha256_failrec_${uniqueSuffix}`,
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
          blockId: 'blk_failrec_1',
          type: 'PARAGRAPH',
          text: 'Name: Bob. Email: bob@example.com.',
          pageNumber: 1,
          readingOrderIndex: 0,
          startOffset: 0,
          endOffset: 34,
          provenance: { documentId: docId, organizationId: orgId, pageNumber: 1, blockId: 'blk_failrec_1' },
        },
      ],
      tables: [],
    });

    const detRunId = `det_run_failrec_${uniqueSuffix}`;
    await DetectionRunModel.create({
      detectionRunId: detRunId,
      organizationId: org._id,
      documentId: doc._id,
      documentChecksum: doc.checksum,
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_failrec',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
    });

    await PIICandidateModel.create({
      candidateId: `cand_failrec_1_${uniqueSuffix}`,
      detectionRunId: detRunId,
      documentId: doc._id,
      organizationId: org._id,
      type: PIIType.EMAIL_ADDRESS,
      category: PIICategory.CONTACT_INFORMATION,
      text: 'bob@example.com',
      normalizedValue: 'bob@example.com',
      confidence: 0.98,
      detectionScore: 0.98,
      severity: PIISeverity.MEDIUM,
      sensitivityScore: 0.75,
      evidence: ['REGEX_MATCH'],
      detectorName: 'EmailDetector',
      detectorType: 'DETERMINISTIC',
      decision: null,
      location: { startOffset: 17, endOffset: 32, blockId: 'blk_failrec_1', pageNumber: 1 },
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_failrec_1' },
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

  test('should maintain Run A active if Run B encounters a publication error', async () => {
    const resA = await contextAnalysisService.runContextAnalysis(docId, orgId, { force: true, userId });
    expect(resA.run.isLatestActive).toBe(true);

    let failCount = 0;
    const originalInsertMany = ContextResultModel.insertMany;
    (jest.spyOn(ContextResultModel, 'insertMany') as jest.SpyInstance).mockImplementation(function (...args: unknown[]) {
      if (failCount === 0) {
        failCount++;
        return Promise.reject(new Error('Simulated Database Insert Failure'));
      }
      return (originalInsertMany as (...a: unknown[]) => unknown).apply(ContextResultModel, args);
    });

    await expect(
      contextAnalysisService.runContextAnalysis(docId, orgId, { force: true, userId })
    ).rejects.toThrow('Simulated Database Insert Failure');

    jest.restoreAllMocks();

    const activeRuns = await ContextAnalysisRunModel.find({
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: new mongoose.Types.ObjectId(docId),
      isLatestActive: true,
    });

    expect(activeRuns.length).toBe(1);
    expect(activeRuns[0].contextAnalysisRunId).toBe(resA.run.contextAnalysisRunId);
  });
});
