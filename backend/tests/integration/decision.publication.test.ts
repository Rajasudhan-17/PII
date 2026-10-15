import mongoose from 'mongoose';
import { policyService } from '../../src/services/policy/policy.service';
import { Organization } from '../../src/models/organization.model';
import { DocumentModel } from '../../src/models/document.model';
import { DetectionRunModel } from '../../src/models/detectionRun.model';
import { ContextAnalysisRunModel } from '../../src/models/contextAnalysisRun.model';
import { DecisionRunModel } from '../../src/models/decisionRun.model';
import { DecisionResultModel } from '../../src/models/decisionResult.model';

describe('Active Decision Run Durable Publication Integration Tests', () => {
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
    await DecisionRunModel.deleteMany({});
    await DecisionResultModel.deleteMany({});

    const createdByUser = new mongoose.Types.ObjectId();

    // Tenant A
    const orgA = await Organization.create({
      name: 'Pub Org A',
      normalizedName: 'pub org a',
      createdBy: createdByUser,
      slug: 'pub-org-a',
      status: 'ACTIVE',
    });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const docA = await DocumentModel.create({
      organizationId: orgAId,
      uploadedBy: createdByUser,
      originalFilename: 'pub_doc_a.pdf',
      size: 1024,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: `org_${orgAId}/pub_doc_a.pdf`,
      checksum: 'hash_pub_a',
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docAId = docA._id as mongoose.Types.ObjectId;

    await DetectionRunModel.create({
      detectionRunId: 'det_pub_a',
      organizationId: orgAId,
      documentId: docAId,
      documentChecksum: 'hash_pub_a',
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_config_pub_a',
      status: 'COMPLETED',
      isLatestActive: true,
      startedAt: new Date(),
    });

    await ContextAnalysisRunModel.create({
      contextAnalysisRunId: 'ctx_pub_a',
      organizationId: orgAId,
      documentId: docAId,
      detectionRunId: 'det_pub_a',
      documentChecksum: 'hash_pub_a',
      normalizedDocumentVersion: '1.0.0',
      contextConfigurationVersion: '1.0.0',
      contextConfigurationHash: 'hash_ctx_config_pub_a',
      status: 'COMPLETED',
      isLatestActive: true,
      startedAt: new Date(),
    });

    // Tenant B
    const orgB = await Organization.create({
      name: 'Pub Org B',
      normalizedName: 'pub org b',
      createdBy: createdByUser,
      slug: 'pub-org-b',
      status: 'ACTIVE',
    });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const docB = await DocumentModel.create({
      organizationId: orgBId,
      uploadedBy: createdByUser,
      originalFilename: 'pub_doc_b.pdf',
      size: 2048,
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      storageKey: `org_${orgBId}/pub_doc_b.pdf`,
      checksum: 'hash_pub_b',
      status: 'EXTRACTED',
      isDeleted: false,
    });
    docBId = docB._id as mongoose.Types.ObjectId;

    await DetectionRunModel.create({
      detectionRunId: 'det_pub_b',
      organizationId: orgBId,
      documentId: docBId,
      documentChecksum: 'hash_pub_b',
      normalizedDocumentVersion: '1.0.0',
      detectorConfigurationVersion: '1.0.0',
      detectorConfigurationHash: 'hash_det_config_pub_b',
      status: 'COMPLETED',
      isLatestActive: true,
      startedAt: new Date(),
    });

    await ContextAnalysisRunModel.create({
      contextAnalysisRunId: 'ctx_pub_b',
      organizationId: orgBId,
      documentId: docBId,
      detectionRunId: 'det_pub_b',
      documentChecksum: 'hash_pub_b',
      normalizedDocumentVersion: '1.0.0',
      contextConfigurationVersion: '1.0.0',
      contextConfigurationHash: 'hash_ctx_config_pub_b',
      status: 'COMPLETED',
      isLatestActive: true,
      startedAt: new Date(),
    });
  });

  it('Test D — First publication: No previous active run exists, new run becomes active', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const { run } = await policyService.evaluateDocumentDecisions(docAId.toString(), orgAId.toString());

    expect(run.isLatestActive).toBe(true);

    const activeRuns = await DecisionRunModel.find({
      organizationId: orgAId,
      documentId: docAId,
      isLatestActive: true,
    });

    expect(activeRuns.length).toBe(1);
    expect(activeRuns[0].decisionRunId).toBe(run.decisionRunId);
  });

  it('Test A — Normal publication: Run 1 active -> publish Run 2 -> Run 1 inactive, Run 2 active', async () => {
    if (mongoose.connection.readyState !== 1) return;

    // Run 1
    const { run: run1 } = await policyService.evaluateDocumentDecisions(docAId.toString(), orgAId.toString());
    expect(run1.isLatestActive).toBe(true);

    // Run 2 (forced new evaluation)
    const { run: run2 } = await policyService.evaluateDocumentDecisions(docAId.toString(), orgAId.toString(), {
      force: true,
    });
    expect(run2.isLatestActive).toBe(true);

    const run1Updated = await DecisionRunModel.findOne({ decisionRunId: run1.decisionRunId });
    expect(run1Updated?.isLatestActive).toBe(false);

    const activeRuns = await DecisionRunModel.find({
      organizationId: orgAId,
      documentId: docAId,
      isLatestActive: true,
    });

    expect(activeRuns.length).toBe(1);
    expect(activeRuns[0].decisionRunId).toBe(run2.decisionRunId);
  });

  it('Test C — Publication failure: Force publication failure -> previous active run restored, exactly 1 active run', async () => {
    if (mongoose.connection.readyState !== 1) return;

    // Run 1 active
    const { run: run1 } = await policyService.evaluateDocumentDecisions(docAId.toString(), orgAId.toString());
    expect(run1.isLatestActive).toBe(true);

    // Create candidate run 2 manually to simulate publication step
    const run2 = await DecisionRunModel.create({
      decisionRunId: 'dec_run_pub_fail_test',
      organizationId: orgAId,
      documentId: docAId,
      detectionRunId: 'det_pub_a',
      contextAnalysisRunId: 'ctx_pub_a',
      policyId: run1.policyId,
      policyVersion: 2,
      policyConfigurationHash: 'hash_test_fail',
      status: 'COMPLETED',
      isLatestActive: false,
      startedAt: new Date(),
    });

    // Mock updateOne to throw error when activating run2
    const originalUpdateOne = DecisionRunModel.updateOne.bind(DecisionRunModel);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(DecisionRunModel, 'updateOne').mockImplementation(((filter: any, doc: any, options?: any) => {
      if (filter && filter._id?.toString() === run2._id.toString() && doc?.$set?.isLatestActive === true) {
        throw new Error('SIMULATED_PUBLICATION_DATABASE_ERROR');
      }
      return originalUpdateOne(filter, doc, options);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    await expect(policyService.publishActiveRun(run2, orgAId, docAId)).rejects.toThrow(
      'SIMULATED_PUBLICATION_DATABASE_ERROR'
    );

    jest.restoreAllMocks();

    // Verify previous active run1 was restored to active=true
    const run1Restored = await DecisionRunModel.findOne({ decisionRunId: run1.decisionRunId });
    expect(run1Restored?.isLatestActive).toBe(true);

    const activeRuns = await DecisionRunModel.find({
      organizationId: orgAId,
      documentId: docAId,
      isLatestActive: true,
    });

    expect(activeRuns.length).toBe(1);
    expect(activeRuns[0].decisionRunId).toBe(run1.decisionRunId);
  });

  it('Test E — Cross-tenant publication: Tenant A publication must never deactivate or replace Tenant B active run', async () => {
    if (mongoose.connection.readyState !== 1) return;

    // Activate run for Tenant A
    const { run: runA } = await policyService.evaluateDocumentDecisions(docAId.toString(), orgAId.toString());
    expect(runA.isLatestActive).toBe(true);

    // Activate run for Tenant B
    const { run: runB } = await policyService.evaluateDocumentDecisions(docBId.toString(), orgBId.toString());
    expect(runB.isLatestActive).toBe(true);

    // Force new active run for Tenant A
    const { run: runA2 } = await policyService.evaluateDocumentDecisions(docAId.toString(), orgAId.toString(), {
      force: true,
    });

    expect(runA2.isLatestActive).toBe(true);

    // Verify Tenant B's active run remains active and untouched
    const runBCheck = await DecisionRunModel.findOne({ decisionRunId: runB.decisionRunId });
    expect(runBCheck?.isLatestActive).toBe(true);

    const activeRunsA = await DecisionRunModel.find({ organizationId: orgAId, isLatestActive: true });
    const activeRunsB = await DecisionRunModel.find({ organizationId: orgBId, isLatestActive: true });

    expect(activeRunsA.length).toBe(1);
    expect(activeRunsA[0].decisionRunId).toBe(runA2.decisionRunId);

    expect(activeRunsB.length).toBe(1);
    expect(activeRunsB[0].decisionRunId).toBe(runB.decisionRunId);
  });
});
