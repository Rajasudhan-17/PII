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

describe('Decision Evaluation Concurrency Integration Tests', () => {
  let orgId: string;
  let docId: string;
  let userId: string;

  beforeAll(async () => {
    await connectDatabase();

    const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
    const email = `dec_conc_${uniqueSuffix}@example.com`;
    const user = await User.create({
      email,
      normalizedEmail: email.toLowerCase(),
      passwordHash: 'hashed_password_123',
      firstName: 'Decision',
      lastName: 'Concurrency',
      role: 'ORG_ADMIN',
    });
    userId = user._id.toString();

    const orgName = `Decision Concurrency Org ${uniqueSuffix}`;
    const org = await Organization.create({
      name: orgName,
      normalizedName: orgName.toLowerCase(),
      createdBy: user._id,
      slug: `dec-conc-org-${uniqueSuffix}`,
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
      checksum: `sha256_dec_conc_${uniqueSuffix}`,
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
          text: 'Name: Bob. Phone: +1-555-0199.',
          pageNumber: 1,
          readingOrderIndex: 0,
          startOffset: 0,
          endOffset: 30,
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

    const candId = `cand_conc_1_${uniqueSuffix}`;
    await PIICandidateModel.create({
      candidateId: candId,
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
      location: { startOffset: 18, endOffset: 30, blockId: 'blk_conc_1', pageNumber: 1 },
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_conc_1' },
    });

    const cxRunId = `cx_run_conc_${uniqueSuffix}`;
    await ContextAnalysisRunModel.create({
      contextAnalysisRunId: cxRunId,
      organizationId: org._id,
      documentId: doc._id,
      detectionRunId: detRunId,
      documentChecksum: doc.checksum,
      normalizedDocumentVersion: '1.0.0',
      contextConfigurationVersion: '1.0.0',
      contextConfigurationHash: 'hash_cx_conc',
      status: 'COMPLETED',
      isLatestActive: true,
      candidateCount: 1,
      processedCount: 1,
    });

    await ContextResultModel.create({
      contextResultId: `cx_res_conc_${uniqueSuffix}`,
      contextAnalysisRunId: cxRunId,
      candidateId: candId,
      documentId: doc._id,
      organizationId: org._id,
      contextWindow: { type: 'PARAGRAPH', textLength: 30, startOffset: 0, endOffset: 30, blockId: 'blk_conc_1' },
      semanticRole: 'CONTACT_FIELD',
      fieldLabel: 'Phone',
      nearbyKeywords: ['Phone'],
      structuralContext: { isTable: false, isHeaderFooter: false, isForm: false },
      contextualScore: 0.8,
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

  test('should guarantee exactly 1 active decision run when 10 simultaneous evaluation requests occur', async () => {
    const promises = Array.from({ length: 10 }).map(() =>
      policyService.evaluateDocumentDecisions(docId, orgId, { force: true, userId })
    );

    const results = await Promise.all(promises);
    expect(results.length).toBe(10);

    const activeRuns = await DecisionRunModel.find({
      organizationId: new mongoose.Types.ObjectId(orgId),
      documentId: new mongoose.Types.ObjectId(docId),
      isLatestActive: true,
    });

    expect(activeRuns.length).toBe(1);
  });
});
