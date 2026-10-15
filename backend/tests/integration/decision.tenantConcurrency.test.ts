import mongoose from 'mongoose';
import { policyService } from '../../src/services/policy/policy.service';
import { Organization } from '../../src/models/organization.model';
import { DocumentModel } from '../../src/models/document.model';
import { DetectionRunModel } from '../../src/models/detectionRun.model';
import { ContextAnalysisRunModel } from '../../src/models/contextAnalysisRun.model';
import { PIICandidateModel } from '../../src/models/piiCandidate.model';
import { DecisionRunModel } from '../../src/models/decisionRun.model';
import { DecisionResultModel } from '../../src/models/decisionResult.model';
import { PIIType, PIICategory } from '../../src/config/piiTaxonomy';

describe('Cross-Tenant Decision Concurrency & Idempotency Integration Tests', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let docAId: mongoose.Types.ObjectId;
  let docBId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pii_platform_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState !== 1) return;

    await Organization.deleteMany({});
    await DocumentModel.deleteMany({});
    await DetectionRunModel.deleteMany({});
    await ContextAnalysisRunModel.deleteMany({});
    await PIICandidateModel.deleteMany({});
    await DecisionRunModel.deleteMany({});
    await DecisionResultModel.deleteMany({});

    const createdByUser = new mongoose.Types.ObjectId();

    // Setup Tenant A
    const orgA = await Organization.create({
      name: 'Tenant Org A',
      normalizedName: 'tenant org a',
      createdBy: createdByUser,
      slug: 'tenant-org-a',
      status: 'ACTIVE',
    });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const docA = await DocumentModel.create({
      organizationId: orgAId,
      uploadedBy: createdByUser,
      originalFilename: 'doc_a.pdf',
      size: 1024,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: `org_${orgAId}/doc_a.pdf`,
      checksum: 'hash_a',
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docAId = docA._id as mongoose.Types.ObjectId;

    await DetectionRunModel.create({
      detectionRunId: 'det_run_a',
      organizationId: orgAId,
      documentId: docAId,
      documentChecksum: 'hash_a',
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_config_a',
      status: 'COMPLETED',
      isLatestActive: true,
      startedAt: new Date(),
    });

    await ContextAnalysisRunModel.create({
      contextAnalysisRunId: 'ctx_run_a',
      organizationId: orgAId,
      documentId: docAId,
      detectionRunId: 'det_run_a',
      documentChecksum: 'hash_a',
      normalizedDocumentVersion: '1.0.0',
      contextConfigurationVersion: '1.0.0',
      contextConfigurationHash: 'hash_ctx_config_a',
      status: 'COMPLETED',
      isLatestActive: true,
      startedAt: new Date(),
    });

    await PIICandidateModel.create({
      candidateId: 'cand_a_1',
      organizationId: orgAId,
      documentId: docAId,
      detectionRunId: 'det_run_a',
      type: PIIType.EMAIL_ADDRESS,
      category: PIICategory.CONTACT_INFORMATION,
      text: 'admin@orga.com',
      normalizedValue: 'admin@orga.com',
      confidence: 0.95,
      detectionScore: 0.95,
      severity: 'MEDIUM',
      sensitivityScore: 0.75,
      recognitionConfidence: 1.0,
      detectorName: 'EmailDetector',
      detectorType: 'DETERMINISTIC',
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_a_1' },
      location: { startOffset: 0, endOffset: 14, pageNumber: 1 },
    });

    // Setup Tenant B
    const orgB = await Organization.create({
      name: 'Tenant Org B',
      normalizedName: 'tenant org b',
      createdBy: createdByUser,
      slug: 'tenant-org-b',
      status: 'ACTIVE',
    });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const docB = await DocumentModel.create({
      organizationId: orgBId,
      uploadedBy: createdByUser,
      originalFilename: 'doc_b.pdf',
      size: 2048,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: `org_${orgBId}/doc_b.pdf`,
      checksum: 'hash_b',
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docBId = docB._id as mongoose.Types.ObjectId;

    await DetectionRunModel.create({
      detectionRunId: 'det_run_b',
      organizationId: orgBId,
      documentId: docBId,
      documentChecksum: 'hash_b',
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_config_b',
      status: 'COMPLETED',
      isLatestActive: true,
      startedAt: new Date(),
    });

    await ContextAnalysisRunModel.create({
      contextAnalysisRunId: 'ctx_run_b',
      organizationId: orgBId,
      documentId: docBId,
      detectionRunId: 'det_run_b',
      documentChecksum: 'hash_b',
      normalizedDocumentVersion: '1.0.0',
      contextConfigurationVersion: '1.0.0',
      contextConfigurationHash: 'hash_ctx_config_b',
      status: 'COMPLETED',
      isLatestActive: true,
      startedAt: new Date(),
    });

    await PIICandidateModel.create({
      candidateId: 'cand_b_1',
      organizationId: orgBId,
      documentId: docBId,
      detectionRunId: 'det_run_b',
      type: PIIType.PHONE_NUMBER,
      category: PIICategory.CONTACT_INFORMATION,
      text: '+15550199',
      normalizedValue: '+15550199',
      confidence: 0.9,
      detectionScore: 0.9,
      severity: 'MEDIUM',
      sensitivityScore: 0.7,
      recognitionConfidence: 1.0,
      detectorName: 'PhoneDetector',
      detectorType: 'DETERMINISTIC',
      provenance: { sourceType: 'NATIVE_TEXT', blockId: 'blk_b_1' },
      location: { startOffset: 0, endOffset: 9, pageNumber: 1 },
    });
  });

  it('should allow Tenant A and Tenant B to execute decision evaluations simultaneously with identical request ID', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const sharedRequestId = 'req_shared_concurrency_123';

    // Execute concurrent evaluations for Org A and Org B with same requestId
    const [evalA, evalB] = await Promise.all([
      policyService.evaluateDocumentDecisions(docAId.toString(), orgAId.toString(), {
        requestId: sharedRequestId,
      }),
      policyService.evaluateDocumentDecisions(docBId.toString(), orgBId.toString(), {
        requestId: sharedRequestId,
      }),
    ]);

    expect(evalA.run).toBeDefined();
    expect(evalB.run).toBeDefined();

    expect(evalA.run.organizationId.toString()).toBe(orgAId.toString());
    expect(evalB.run.organizationId.toString()).toBe(orgBId.toString());

    expect(evalA.run.decisionRunId).not.toBe(evalB.run.decisionRunId);

    // Verify zero data leakage across tenants
    expect(evalA.results.length).toBe(1);
    expect(evalA.results[0].candidateId).toBe('cand_a_1');

    expect(evalB.results.length).toBe(1);
    expect(evalB.results[0].candidateId).toBe('cand_b_1');

    // Verify decision runs in DB
    const runsA = await DecisionRunModel.find({ organizationId: orgAId });
    const runsB = await DecisionRunModel.find({ organizationId: orgBId });

    expect(runsA.length).toBe(1);
    expect(runsB.length).toBe(1);
    expect(runsA[0].requestId).toBe(sharedRequestId);
    expect(runsB[0].requestId).toBe(sharedRequestId);
  });
});
