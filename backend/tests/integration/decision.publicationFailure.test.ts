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
import { PolicyModel } from '../../src/models/policy.model';
import { DecisionRunModel } from '../../src/models/decisionRun.model';
import { DecisionResultModel } from '../../src/models/decisionResult.model';
import { policyService } from '../../src/services/policy/policy.service';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';

describe('Decision Evaluation Active Publication Failure Recovery Integration Tests', () => {
  let orgId: string;
  let docId: string;
  let userId: string;

  beforeAll(async () => {
    await connectDatabase();

    const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
    const email = `dec_failrec_${uniqueSuffix}@example.com`;
    const user = await User.create({
      email,
      normalizedEmail: email.toLowerCase(),
      passwordHash: 'hashed_password_123',
      firstName: 'Decision',
      lastName: 'FailRec',
      role: 'ORG_ADMIN',
    });
    userId = user._id.toString();

    const orgName = `Decision FailRec Org ${uniqueSuffix}`;
    const org = await Organization.create({
      name: orgName,
      normalizedName: orgName.toLowerCase(),
      createdBy: user._id,
      slug: `dec-failrec-org-${uniqueSuffix}`,
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
      checksum: `sha256_dec_failrec_${uniqueSuffix}`,
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
          text: 'Name: Charlie. Email: charlie@example.com.',
          pageNumber: 1,
          readingOrderIndex: 0,
          startOffset: 0,
          endOffset: 38,
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

    const candId = `cand_failrec_1_${uniqueSuffix}`;
    await PIICandidateModel.create({
      candidateId: candId,
      detectionRunId: detRunId,
      documentId: doc._id,
      organizationId: org._id,
      type: PIIType.EMAIL_ADDRESS,
      category: PIICategory.CONTACT_INFORMATION,
      text: 'charlie@example.com',
      normalizedValue: 'charlie@example.com',
      confidence: 0.98,
      detectionScore: 0.98,
      severity: PIISeverity.MEDIUM,
      sensitivityScore: 0.75,
      evidence: ['REGEX_MATCH'],
      detectorName: 'EmailDetector',
      detectorType: 'DETERMINISTIC',
      decision: null,
      location: { startOffset: 21, endOffset: 37, blockId: 'blk_failrec_1', pageNumber: 1 },
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_failrec_1' },
    });

    const cxRunId = `cx_run_failrec_${uniqueSuffix}`;
    await ContextAnalysisRunModel.create({
      contextAnalysisRunId: cxRunId,
      organizationId: org._id,
      documentId: doc._id,
      detectionRunId: detRunId,
      documentChecksum: doc.checksum,
      normalizedDocumentVersion: '1.0.0',
      contextConfigurationVersion: '1.0.0',
      contextConfigurationHash: 'hash_cx_failrec',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
      processedCount: 1,
    });

    await ContextResultModel.create({
      contextResultId: `cx_res_failrec_${uniqueSuffix}`,
      contextAnalysisRunId: cxRunId,
      candidateId: candId,
      documentId: doc._id,
      organizationId: org._id,
      contextWindow: { type: 'PARAGRAPH', textLength: 38, startOffset: 0, endOffset: 38, blockId: 'blk_failrec_1' },
      semanticRole: 'CONTACT_FIELD',
      fieldLabel: 'Email',
      nearbyKeywords: ['Email'],
      structuralContext: { isTable: false, isHeaderFooter: false, isForm: false },
      contextualScore: 0.85,
      ambiguityIndicators: [],
      language: 'en',
      script: 'Latin',
      analyzerVersion: '1.0.0',
      decision: null,
    });
  }, 30000);

  afterAll(async () => {
    await DecisionResultModel.deleteMany({});
    await DecisionRunModel.deleteMany({});
    await PolicyModel.deleteMany({});
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
    const resA = await policyService.evaluateDocumentDecisions(docId, orgId, { force: true, userId });
    expect(resA.run.isLatestActive).toBe(true);

    let failCount = 0;
    const originalInsertMany = DecisionResultModel.insertMany;
    (jest.spyOn(DecisionResultModel, 'insertMany') as jest.SpyInstance).mockImplementation(function (...args: unknown[]) {
      if (failCount === 0) {
        failCount++;
        return Promise.reject(new Error('Simulated Database Insert Failure'));
      }
      return (originalInsertMany as (...a: unknown[]) => unknown).apply(DecisionResultModel, args);
    });

    await expect(
      policyService.evaluateDocumentDecisions(docId, orgId, { force: true, userId })
    ).rejects.toThrow('Simulated Database Insert Failure');

    jest.restoreAllMocks();

    const activeRuns = await DecisionRunModel.find({
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: new mongoose.Types.ObjectId(docId),
      isLatestActive: true,
    });

    expect(activeRuns.length).toBe(1);
    expect(activeRuns[0].decisionRunId).toBe(resA.run.decisionRunId);
  });
});
