import crypto from 'crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { User } from '../../src/models/user.model';
import { DocumentModel } from '../../src/models/document.model';
import { OutputArtifactModel } from '../../src/models/outputArtifact.model';
import { TransformationRunModel } from '../../src/models/transformationRun.model';
import { VerificationRunModel } from '../../src/models/verificationRun.model';
import { transformationService } from '../../src/services/transformation/transformation.service';
import { documentService } from '../../src/services/document.service';
import { storageService } from '../../src/services/storage/storage.service';
import { AppError } from '../../src/utils/AppError';

describe('Redacted Download Security & Exact Artifact Integrity Tests', () => {
  let app: ReturnType<typeof createApp>;
  const uniqueSuffix = Date.now() + Math.floor(Math.random() * 10000);

  let orgIdStr: string;
  let org2IdStr: string;
  let authTokenOrg1: string;
  let authTokenOrg2: string;
  let user1Id: mongoose.Types.ObjectId;

  const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  };

  beforeAll(async () => {
    app = createApp();
    await connectDatabase();

    // Register Org 1 admin
    const user1Creds = {
      email: `security_admin1_${uniqueSuffix}@tenant.com`,
      password: 'Password123!',
      firstName: 'Admin1',
      lastName: 'Security',
    };
    await request(app).post('/api/v1/auth/register').send(user1Creds);
    await User.updateOne({ email: user1Creds.email.toLowerCase() }, { role: 'ORG_ADMIN' });
    const login1 = await request(app).post('/api/v1/auth/login').send(user1Creds);
    authTokenOrg1 = login1.body.accessToken;

    const org1Res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${authTokenOrg1}`)
      .send({ name: `Security Org 1 ${uniqueSuffix}` });
    orgIdStr = org1Res.body.organization.id;

    const user1Doc = await User.findOne({ normalizedEmail: user1Creds.email.toLowerCase() });
    user1Id = user1Doc!._id;

    // Register Org 2 admin (for tenant isolation test)
    const user2Creds = {
      email: `security_admin2_${uniqueSuffix}@tenant.com`,
      password: 'Password123!',
      firstName: 'Admin2',
      lastName: 'Security',
    };
    await request(app).post('/api/v1/auth/register').send(user2Creds);
    await User.updateOne({ email: user2Creds.email.toLowerCase() }, { role: 'ORG_ADMIN' });
    const login2 = await request(app).post('/api/v1/auth/login').send(user2Creds);
    authTokenOrg2 = login2.body.accessToken;

    const org2Res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${authTokenOrg2}`)
      .send({ name: `Security Org 2 ${uniqueSuffix}` });
    org2IdStr = org2Res.body.organization.id;
  });

  // Helper to create a source document and file via storageService
  const createTestDocument = async (filename: string, content: string) => {
    const storageKey = `uploads/org_${orgIdStr}/${Date.now()}_${filename}`;
    await storageService.put(storageKey, Buffer.from(content, 'utf8'));
    const checksum = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

    const doc = await DocumentModel.create({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      uploadedBy: user1Id,
      originalFilename: filename,
      size: Buffer.byteLength(content, 'utf8'),
      declaredMimeType: 'text/plain',
      detectedMimeType: 'text/plain',
      extension: 'txt',
      storageKey,
      checksum,
      status: 'EXTRACTED',
      isDeleted: false,
    });

    return { doc, storageKey, checksum, content };
  };

  // Helper to create an output artifact and file via storageService
  const createTestArtifact = async (
    doc: InstanceType<typeof DocumentModel>,
    runId: string,
    content: string,
    status: 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PENDING_REVIEW' = 'ACTIVE'
  ) => {
    const artifactId = `art_${crypto.randomUUID()}`;
    const storageKey = `transformed/org_${orgIdStr}/${runId}_${doc.originalFilename}`;
    await storageService.put(storageKey, Buffer.from(content, 'utf8'));

    const outputChecksum = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

    const artifact = await OutputArtifactModel.create({
      outputArtifactId: artifactId,
      organizationId: doc.organizationId,
      sourceDocumentId: doc._id,
      transformationRunId: runId,
      sourceChecksum: doc.checksum,
      outputChecksum,
      storageKey,
      originalFilename: `redacted_${doc.originalFilename}`,
      mimeType: 'text/plain',
      fileSize: Buffer.byteLength(content, 'utf8'),
      status,
    });

    return { artifact, outputChecksum, storageKey, content };
  };

  // Helper to create a transformation run
  const createTestRun = async (
    doc: InstanceType<typeof DocumentModel>,
    artifactId: string,
    runId?: string,
    isLatestActive: boolean = true
  ) => {
    const finalRunId = runId || `run_${crypto.randomUUID()}`;
    const run = await TransformationRunModel.create({
      transformationRunId: finalRunId,
      organizationId: doc.organizationId,
      documentId: doc._id,
      decisionRunId: `dec_${crypto.randomUUID()}`,
      sourceChecksum: doc.checksum,
      sourceDocumentVersion: '1.0.0',
      transformationVersion: '1.0.0',
      transformationConfigurationHash: 'hash',
      operation: 'REDACTION',
      status: 'COMPLETED',
      isLatestActive,
      candidateCount: 1,
      transformedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      warnings: [],
      outputArtifactId: artifactId,
      startedAt: new Date(),
      completedAt: new Date(),
    });

    return run;
  };

  // ──────────────────────────────────────────────────────────────────────────
  // TEST A — Successful Redacted Download
  // ──────────────────────────────────────────────────────────────────────────
  test('Test A: Successful redacted download returns verified artifact bytes, differs from original, and preserves original upload', async () => {
    const originalContent = 'CONFIDENTIAL: Customer Name is Bob Johnson, SSN 000-11-2222.';
    const redactedContent = 'CONFIDENTIAL: Customer Name is [REDACTED], SSN [REDACTED].';

    const { doc, storageKey: originalKey, checksum: originalChecksumBefore } = await createTestDocument('customer_record.txt', originalContent);
    const runId = `run_testA_${uniqueSuffix}`;
    const { artifact, outputChecksum } = await createTestArtifact(doc, runId, redactedContent, 'ACTIVE');
    await createTestRun(doc, artifact.outputArtifactId, runId, true);

    // 1. Service direct invocation
    const { artifact: resArtifact, stream } = await transformationService.downloadVerifiedRedactedArtifact(
      doc._id.toString(),
      orgIdStr,
      { runId }
    );

    const downloadedBytes = await streamToBuffer(stream);
    const downloadedText = downloadedBytes.toString('utf8');

    expect(resArtifact.outputArtifactId).toBe(artifact.outputArtifactId);
    expect(downloadedText).toBe(redactedContent);
    expect(downloadedText).not.toBe(originalContent);

    // Cryptographic validation: SHA-256(downloaded bytes) == OutputArtifact.outputChecksum
    const downloadedChecksum = crypto.createHash('sha256').update(downloadedBytes).digest('hex');
    expect(downloadedChecksum).toBe(outputChecksum);
    expect(downloadedChecksum).not.toBe(originalChecksumBefore);

    // 2. HTTP Dedicated Route GET /transformations/download
    const httpRes = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${doc._id}/transformations/download?runId=${runId}`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(httpRes.status).toBe(200);
    expect(httpRes.text).toBe(redactedContent);
    expect(httpRes.headers['x-artifact-checksum']).toBe(outputChecksum);

    // 3. HTTP Document Route GET /documents/:id/download?transformed=true
    const httpTransformedRes = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${doc._id}/download?transformed=true&runId=${runId}`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(httpTransformedRes.status).toBe(200);
    expect(httpTransformedRes.text).toBe(redactedContent);

    // 4. Invariant: Original file on disk remains strictly immutable
    const origStream = await storageService.getStream(originalKey);
    const originalBytesAfter = await streamToBuffer(origStream);
    const originalChecksumAfter = crypto.createHash('sha256').update(originalBytesAfter).digest('hex');
    expect(originalChecksumAfter).toBe(originalChecksumBefore);
    expect(originalBytesAfter.toString('utf8')).toBe(originalContent);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST B — Artifact Missing (Security Fail-Closed)
  // ──────────────────────────────────────────────────────────────────────────
  test('Test B: Missing artifact FAILS CLOSED and NEVER falls back to original document', async () => {
    const originalContent = 'SECRET: Top secret nuclear launch codes: 99482-A.';
    const { doc, storageKey: originalKey, checksum: originalChecksum } = await createTestDocument('secret_codes.txt', originalContent);

    // No OutputArtifact is created for this document.

    // 1. Service invocation must throw AppError 404
    await expect(
      transformationService.downloadVerifiedRedactedArtifact(doc._id.toString(), orgIdStr)
    ).rejects.toThrow(AppError);

    try {
      await transformationService.downloadVerifiedRedactedArtifact(doc._id.toString(), orgIdStr);
      fail('Expected downloadVerifiedRedactedArtifact to throw 404');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(404);
      expect((err as AppError).errorCode).toBe('REDACTED_ARTIFACT_NOT_AVAILABLE');
    }

    // 2. HTTP Dedicated Route GET /transformations/download must return 404
    const transRouteRes = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${doc._id}/transformations/download`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(transRouteRes.status).toBe(404);
    expect(transRouteRes.body.error.code).toBe('REDACTED_ARTIFACT_NOT_AVAILABLE');
    // Critical assertion: Original unredacted text MUST NEVER be in the response
    expect(transRouteRes.text).not.toContain(originalContent);
    expect(transRouteRes.text).not.toContain('99482-A');

    // 3. HTTP Document Route GET /documents/:id/download?transformed=true must fail closed (404)
    const docTransformedRes = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${doc._id}/download?transformed=true`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(docTransformedRes.status).toBe(404);
    expect(docTransformedRes.body.error.code).toBe('REDACTED_ARTIFACT_NOT_AVAILABLE');
    expect(docTransformedRes.text).not.toContain(originalContent);
    expect(docTransformedRes.text).not.toContain('99482-A');

    // 4. HTTP Document Route GET /documents/:id/download?version=redacted must fail closed (404)
    const docVersionRes = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${doc._id}/download?version=redacted`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(docVersionRes.status).toBe(404);
    expect(docVersionRes.body.error.code).toBe('REDACTED_ARTIFACT_NOT_AVAILABLE');
    expect(docVersionRes.text).not.toContain(originalContent);

    // 5. Verify original file on disk is unmodified
    const origStream = await storageService.getStream(originalKey);
    const originalDiskBytes = await streamToBuffer(origStream);
    expect(originalDiskBytes.toString('utf8')).toBe(originalContent);
    const diskChecksum = crypto.createHash('sha256').update(originalDiskBytes).digest('hex');
    expect(diskChecksum).toBe(originalChecksum);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST C — Artifact Unavailable / Unverified
  // ──────────────────────────────────────────────────────────────────────────
  test('Test C: Artifacts with PENDING_REVIEW, INACTIVE, or FAILED verification are blocked from download', async () => {
    const originalContent = 'Patient medical diagnosis: Jane Doe has condition X.';
    const pendingRedacted = 'Patient medical diagnosis: [REVIEW_REQUIRED] has condition X.';

    // Case C.1: Artifact in PENDING_REVIEW state
    const { doc: docPending } = await createTestDocument('patient_pending.txt', originalContent);
    const runId1 = `run_pending_${uniqueSuffix}`;
    const { artifact: pendingArtifact } = await createTestArtifact(docPending, runId1, pendingRedacted, 'PENDING_REVIEW');
    await createTestRun(docPending, pendingArtifact.outputArtifactId, runId1, true);

    const pendingRes = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${docPending._id}/transformations/download?runId=${runId1}`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(pendingRes.status).toBe(409);
    expect(pendingRes.body.error.code).toBe('REDACTED_ARTIFACT_PENDING_REVIEW');
    expect(pendingRes.text).not.toContain(originalContent);

    // Case C.2: Artifact in ARCHIVED / DELETED state
    const { doc: docArchived } = await createTestDocument('patient_archived.txt', originalContent);
    const runId2 = `run_archived_${uniqueSuffix}`;
    const { artifact: archivedArtifact } = await createTestArtifact(docArchived, runId2, pendingRedacted, 'ARCHIVED');

    await expect(
      transformationService.downloadVerifiedRedactedArtifact(docArchived._id.toString(), orgIdStr, {
        outputArtifactId: archivedArtifact.outputArtifactId,
      })
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'REDACTED_ARTIFACT_NOT_AVAILABLE' });

    // Case C.3: Artifact is ACTIVE, but independent verification FAILED
    const { doc: docFailedVerif } = await createTestDocument('patient_failed_verif.txt', originalContent);
    const runId3 = `run_failed_verif_${uniqueSuffix}`;
    const { artifact: failedVerifArtifact } = await createTestArtifact(docFailedVerif, runId3, 'Partially redacted', 'ACTIVE');
    await createTestRun(docFailedVerif, failedVerifArtifact.outputArtifactId, runId3, true);

    await VerificationRunModel.create({
      verificationRunId: `vrun_${crypto.randomUUID()}`,
      organizationId: docFailedVerif.organizationId,
      documentId: docFailedVerif._id,
      sourceArtifactId: docFailedVerif._id.toString(),
      outputArtifactId: failedVerifArtifact.outputArtifactId,
      sourceChecksum: docFailedVerif.checksum,
      outputChecksum: failedVerifArtifact.outputChecksum,
      configurationVersion: '1.0.0',
      configurationHash: 'hash',
      verificationModelVersion: '1.0.0',
      status: 'FAILED',
      overallStatus: 'FAILED',
      failureReason: 'Sensitive PII residual leak detected in output artifact stream',
      isLatestActive: true,
    });

    const failedVerifRes = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${docFailedVerif._id}/transformations/download?outputArtifactId=${failedVerifArtifact.outputArtifactId}`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(failedVerifRes.status).toBe(409);
    expect(failedVerifRes.body.error.code).toBe('REDACTED_ARTIFACT_VERIFICATION_FAILED');

    // Case C.4: Artifact is ACTIVE, but independent verification is RUNNING
    const { doc: docRunningVerif } = await createTestDocument('patient_running_verif.txt', originalContent);
    const runId4 = `run_running_verif_${uniqueSuffix}`;
    const { artifact: runningVerifArtifact } = await createTestArtifact(docRunningVerif, runId4, 'Under verification', 'ACTIVE');
    await createTestRun(docRunningVerif, runningVerifArtifact.outputArtifactId, runId4, true);

    await VerificationRunModel.create({
      verificationRunId: `vrun_${crypto.randomUUID()}`,
      organizationId: docRunningVerif.organizationId,
      documentId: docRunningVerif._id,
      sourceArtifactId: docRunningVerif._id.toString(),
      outputArtifactId: runningVerifArtifact.outputArtifactId,
      sourceChecksum: docRunningVerif.checksum,
      outputChecksum: runningVerifArtifact.outputChecksum,
      configurationVersion: '1.0.0',
      configurationHash: 'hash',
      verificationModelVersion: '1.0.0',
      status: 'RUNNING',
      overallStatus: null,
      isLatestActive: true,
    });

    const runningVerifRes = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${docRunningVerif._id}/transformations/download?outputArtifactId=${runningVerifArtifact.outputArtifactId}`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(runningVerifRes.status).toBe(409);
    expect(runningVerifRes.body.error.code).toBe('REDACTED_ARTIFACT_VERIFICATION_PENDING');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST D — Exact Run / Artifact Binding
  // ──────────────────────────────────────────────────────────────────────────
  test('Test D: Exact run/artifact binding ensures requested run retrieves corresponding artifact and rejects mismatches', async () => {
    const originalContent = 'Document with multiple transformations: Alice and Bob.';
    const { doc } = await createTestDocument('multi_runs.txt', originalContent);

    // Transformation Run A -> Artifact A
    const runAId = `run_A_${uniqueSuffix}`;
    const contentA = 'Document with multiple transformations: [REDACTED_ALICE] and Bob.';
    const { artifact: artifactA } = await createTestArtifact(doc, runAId, contentA, 'ACTIVE');
    await createTestRun(doc, artifactA.outputArtifactId, runAId, false);

    // Transformation Run B -> Artifact B
    const runBId = `run_B_${uniqueSuffix}`;
    const contentB = 'Document with multiple transformations: [REDACTED_ALICE] and [REDACTED_BOB].';
    const { artifact: artifactB } = await createTestArtifact(doc, runBId, contentB, 'ACTIVE');
    await createTestRun(doc, artifactB.outputArtifactId, runBId, true);

    // Request Run A -> Expect Artifact A
    const resA = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${doc._id}/transformations/download?runId=${runAId}`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(resA.status).toBe(200);
    expect(resA.text).toBe(contentA);
    expect(resA.text).not.toBe(contentB);

    // Request Run B -> Expect Artifact B
    const resB = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${doc._id}/transformations/download?runId=${runBId}`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(resB.status).toBe(200);
    expect(resB.text).toBe(contentB);
    expect(resB.text).not.toBe(contentA);

    // Mismatched runId and outputArtifactId -> Fails closed
    const mismatchRes = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${doc._id}/transformations/download?runId=${runAId}&outputArtifactId=${artifactB.outputArtifactId}`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(mismatchRes.status).toBe(409);
    expect(mismatchRes.body.error.code).toBe('REDACTED_ARTIFACT_NOT_AVAILABLE');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST E — Cross-Tenant Isolation
  // ──────────────────────────────────────────────────────────────────────────
  test('Test E: Tenant B cannot access Tenant A redacted artifacts', async () => {
    const tenantAContent = 'Tenant A Private Financial Data: $5,000,000 revenue.';
    const tenantARedacted = 'Tenant A Private Financial Data: [REDACTED] revenue.';

    const { doc: docA } = await createTestDocument('tenant_a_finance.txt', tenantAContent);
    const runAId = `run_tenantA_${uniqueSuffix}`;
    const { artifact: artifactA } = await createTestArtifact(docA, runAId, tenantARedacted, 'ACTIVE');
    await createTestRun(docA, artifactA.outputArtifactId, runAId, true);

    // Org 2 requests Org 1's document via dedicated download route
    const crossTenantRes = await request(app)
      .get(`/api/v1/organizations/${org2IdStr}/documents/${docA._id}/transformations/download`)
      .set('Authorization', `Bearer ${authTokenOrg2}`);

    expect([403, 404]).toContain(crossTenantRes.status);
    expect(crossTenantRes.text).not.toContain(tenantAContent);
    expect(crossTenantRes.text).not.toContain(tenantARedacted);

    // Direct service call with mismatched organization ID must fail
    await expect(
      transformationService.downloadVerifiedRedactedArtifact(docA._id.toString(), org2IdStr)
    ).rejects.toMatchObject({ statusCode: 404, errorCode: 'DOCUMENT_NOT_FOUND' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST F — Original Document Download Preserved
  // ──────────────────────────────────────────────────────────────────────────
  test('Test F: Normal GET /documents/:id/download without transformed parameter returns original unmodified file', async () => {
    const originalContent = 'Standard Unmodified Contract: Terms & Conditions apply.';
    const { doc, checksum: originalChecksum } = await createTestDocument('standard_contract.txt', originalContent);

    // Create an active redacted version too
    const runId = `run_orig_test_${uniqueSuffix}`;
    const { artifact } = await createTestArtifact(doc, runId, 'Standard Unmodified Contract: [REDACTED]', 'ACTIVE');
    await createTestRun(doc, artifact.outputArtifactId, runId, true);

    // 1. Direct service call to downloadOriginalDocument
    const { doc: downloadedDoc, stream } = await documentService.downloadOriginalDocument(
      orgIdStr,
      doc._id.toString()
    );

    const streamBytes = await streamToBuffer(stream);
    expect(streamBytes.toString('utf8')).toBe(originalContent);
    expect(downloadedDoc.checksum).toBe(originalChecksum);

    // 2. HTTP call to GET /documents/:id/download
    const httpOriginalRes = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${doc._id}/download`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(httpOriginalRes.status).toBe(200);
    expect(httpOriginalRes.text).toBe(originalContent);
    expect(httpOriginalRes.text).not.toContain('[REDACTED]');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Critical Acceptance Test
  // ──────────────────────────────────────────────────────────────────────────
  test('Critical Acceptance Test: End-to-end synthetic scenario proving downloaded bytes !== original bytes and original remains immutable', async () => {
    const originalText = [
      'EMPLOYEE VERIFICATION RECORD',
      'Identifier: TEST-ID-88421763',
      'Email: ananya.krishnan@example.test',
      'Contact: +91 90000 12345',
      'Status: Verified Employee',
    ].join('\n');

    const redactedText = [
      'EMPLOYEE VERIFICATION RECORD',
      'Identifier: [REDACTED_ID]',
      'Email: [REDACTED_EMAIL]',
      'Contact: [REDACTED_PHONE]',
      'Status: Verified Employee',
    ].join('\n');

    const { doc, storageKey: originalKey, checksum: originalChecksumBefore } = await createTestDocument('employee_ananya.txt', originalText);
    const runId = `run_acceptance_${uniqueSuffix}`;
    const { artifact, outputChecksum } = await createTestArtifact(doc, runId, redactedText, 'ACTIVE');
    await createTestRun(doc, artifact.outputArtifactId, runId, true);

    // Request redacted download via both dedicated route and query param
    const dedicatedDownloadRes = await request(app)
      .get(`/api/v1/organizations/${orgIdStr}/documents/${doc._id}/transformations/download?runId=${runId}`)
      .set('Authorization', `Bearer ${authTokenOrg1}`);

    expect(dedicatedDownloadRes.status).toBe(200);
    const downloadedBytes = Buffer.from(dedicatedDownloadRes.body && Buffer.isBuffer(dedicatedDownloadRes.body) ? dedicatedDownloadRes.body : dedicatedDownloadRes.text);
    const downloadedContent = downloadedBytes.toString('utf8');

    // 1. Original file contains all PII
    expect(originalText).toContain('TEST-ID-88421763');
    expect(originalText).toContain('ananya.krishnan@example.test');
    expect(originalText).toContain('+91 90000 12345');

    // 2. Downloaded redacted file DOES NOT contain recoverable PII
    expect(downloadedContent).not.toContain('TEST-ID-88421763');
    expect(downloadedContent).not.toContain('ananya.krishnan@example.test');
    expect(downloadedContent).not.toContain('+91 90000 12345');
    expect(downloadedContent).toContain('[REDACTED_ID]');
    expect(downloadedContent).toContain('[REDACTED_EMAIL]');
    expect(downloadedContent).toContain('[REDACTED_PHONE]');

    // 3. Downloaded bytes !== original bytes
    expect(downloadedBytes.equals(Buffer.from(originalText, 'utf8'))).toBe(false);
    expect(downloadedContent).not.toBe(originalText);

    // 4. Downloaded bytes == verified OutputArtifact bytes
    const computedDownloadedChecksum = crypto.createHash('sha256').update(downloadedBytes).digest('hex');
    expect(computedDownloadedChecksum).toBe(outputChecksum);

    // 5. Original file on disk still contains the original data and has unchanged checksum
    const origStream = await storageService.getStream(originalKey);
    const diskOriginalAfterBytes = await streamToBuffer(origStream);
    const diskOriginalAfter = diskOriginalAfterBytes.toString('utf8');
    expect(diskOriginalAfter).toBe(originalText);
    expect(diskOriginalAfter).toContain('TEST-ID-88421763');
    expect(diskOriginalAfter).toContain('ananya.krishnan@example.test');
    expect(diskOriginalAfter).toContain('+91 90000 12345');

    const computedOriginalChecksumAfter = crypto.createHash('sha256').update(diskOriginalAfter, 'utf8').digest('hex');
    expect(computedOriginalChecksumAfter).toBe(originalChecksumBefore);
  });
});
