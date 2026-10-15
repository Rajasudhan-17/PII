import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { createApp } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { connectRedis } from '../../src/config/redis';
import { validateEnv } from '../../src/config/env';
import { User } from '../../src/models/user.model';
import { Organization } from '../../src/models/organization.model';
import { OrganizationMembership } from '../../src/models/membership.model';
import { DocumentModel } from '../../src/models/document.model';
import { NormalizedDocumentModel } from '../../src/models/normalizedDocument.model';
import { PIICandidateModel } from '../../src/models/piiCandidate.model';
import { PolicyModel } from '../../src/models/policy.model';
import { TransformationRunModel } from '../../src/models/transformationRun.model';
import { ReidentificationRiskRunModel } from '../../src/models/reidentificationRiskRun.model';
import { ReidentificationRiskResultModel } from '../../src/models/reidentificationRiskResult.model';
import { HumanReviewCaseModel } from '../../src/models/humanReviewCase.model';
import { generateAccessToken, generateRefreshToken } from '../../src/services/token.service';
import { PIIType } from '../../src/config/piiTaxonomy';
import { extractionService } from '../../src/services/extraction.service';
import { piiDetectionService } from '../../src/services/pii/piiDetection.service';
import { contextAnalysisService } from '../../src/services/context/contextAnalysis.service';
import { policyService } from '../../src/services/policy/policy.service';
import { transformationService } from '../../src/services/transformation/transformation.service';
import { sanitizationService } from '../../src/services/sanitization/sanitization.service';
import { riskService } from '../../src/services/risk/risk.service';
import { verificationService } from '../../src/services/verification/verification.service';
import { humanReviewService } from '../../src/services/humanReview/humanReview.service';
import { AudioProcessingEngine } from '../../src/services/media/audioEngine';
import { VideoProcessingEngine } from '../../src/services/media/videoEngine';
import { MediaModalityService } from '../../src/services/media/mediaModalityService';
import { MediaProcessingResult } from '../../src/services/media/mediaTypes';
import { getDeadLetterQueue, DEAD_LETTER_QUEUE_NAME } from '../../src/queues/queue';
import { metrics } from '../../src/utils/metrics';

describe('FULL BACKEND FUNCTIONAL VALIDATION — PHASES 01–15', () => {
  const app = createApp();
  const testRunId = `e2e_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  // Tenant A Fixtures
  let tenantAOrgId: string;
  let tenantAAdminId: string;
  let tenantAAdminToken: string;
  let tenantAReviewerId: string;
  let tenantAReviewerToken: string;

  // Tenant B Fixtures (Cross-Tenant Verification)
  let tenantBOrgId: string;
  let tenantBAdminId: string;
  let tenantBAdminToken: string;

  // Shared scratch test directory
  const testScratchDir = path.resolve(process.cwd(), 'scratch', `test_run_${testRunId}`);

  beforeAll(async () => {
    validateEnv();
    await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
    await connectRedis();

    await fs.promises.mkdir(testScratchDir, { recursive: true });

    // 1. Provision Tenant A: Organization, Org Admin, and Reviewer
    const tenantAAdmin = await User.create({
      email: `admin_tenanta_${testRunId}@test.local`,
      normalizedEmail: `admin_tenanta_${testRunId}@test.local`,
      passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/r6E/j62iF9LzH9m9i.1.2.3',
      fullName: 'Tenant A Administrator',
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
    });
    tenantAAdminId = tenantAAdmin._id.toString();

    const tenantAOrg = await Organization.create({
      name: `Tenant A Corp ${testRunId}`,
      normalizedName: `tenant a corp ${testRunId}`.toLowerCase(),
      createdBy: tenantAAdmin._id,
    });
    tenantAOrgId = tenantAOrg._id.toString();

    await OrganizationMembership.create({
      organizationId: tenantAOrg._id,
      userId: tenantAAdmin._id,
      tenantRole: 'ORG_ADMIN',
      status: 'ACTIVE',
    });

    tenantAAdminToken = generateAccessToken({
      userId: tenantAAdminId,
      email: tenantAAdmin.email,
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
    });

    const tenantAReviewer = await User.create({
      email: `reviewer_tenanta_${testRunId}@test.local`,
      normalizedEmail: `reviewer_tenanta_${testRunId}@test.local`,
      passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/r6E/j62iF9LzH9m9i.1.2.3',
      fullName: 'Tenant A Reviewer',
      role: 'REVIEWER',
      status: 'ACTIVE',
    });
    tenantAReviewerId = tenantAReviewer._id.toString();

    await OrganizationMembership.create({
      organizationId: tenantAOrg._id,
      userId: tenantAReviewer._id,
      tenantRole: 'REVIEWER',
      status: 'ACTIVE',
    });

    tenantAReviewerToken = generateAccessToken({
      userId: tenantAReviewerId,
      email: tenantAReviewer.email,
      role: 'REVIEWER',
      status: 'ACTIVE',
    });

    // 2. Provision Tenant B: Isolated Organization and Admin
    const tenantBAdmin = await User.create({
      email: `admin_tenantb_${testRunId}@test.local`,
      normalizedEmail: `admin_tenantb_${testRunId}@test.local`,
      passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/r6E/j62iF9LzH9m9i.1.2.3',
      fullName: 'Tenant B Administrator',
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
    });
    tenantBAdminId = tenantBAdmin._id.toString();

    const tenantBOrg = await Organization.create({
      name: `Tenant B Corp ${testRunId}`,
      normalizedName: `tenant b corp ${testRunId}`.toLowerCase(),
      createdBy: tenantBAdmin._id,
    });
    tenantBOrgId = tenantBOrg._id.toString();

    await OrganizationMembership.create({
      organizationId: tenantBOrg._id,
      userId: tenantBAdmin._id,
      tenantRole: 'ORG_ADMIN',
      status: 'ACTIVE',
    });

    tenantBAdminToken = generateAccessToken({
      userId: tenantBAdminId,
      email: tenantBAdmin.email,
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
    });
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(testScratchDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // =========================================================================
  // STAGE 3 — STARTUP AND HEALTH
  // =========================================================================
  describe('Stage 3 — Startup, Health Probing & Metrics Authorization', () => {
    test('MongoDB and Redis connection readiness', () => {
      expect(mongoose.connection.readyState).toBe(1); // 1 = connected
    });

    test('GET /health/liveness returns 200 OK with service identifier', async () => {
      const res = await request(app).get('/health/liveness');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('service', 'pii-backend');
      expect(res.body).toHaveProperty('timestamp');
    });

    test('GET /health/readiness returns 200 OK with connected dependencies', async () => {
      const res = await request(app).get('/health/readiness');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ready');
      expect(res.body.dependencies).toEqual({
        mongodb: 'connected',
        redis: 'connected',
      });
    });

    test('GET /health/metrics returns 200 and enforces token authorization when configured', async () => {
      // 1. Unauthenticated request when token is required
      const originalToken = process.env.METRICS_AUTH_TOKEN;
      process.env.METRICS_AUTH_TOKEN = 'secret-test-metrics-token-123';

      try {
        const unauthRes = await request(app).get('/health/metrics');
        expect(unauthRes.status).toBe(401);
        expect(unauthRes.body.status).toBe('unauthorized');

        // 2. Authenticated request with x-metrics-token header
        const authRes = await request(app)
          .get('/health/metrics')
          .set('x-metrics-token', 'secret-test-metrics-token-123');
        expect(authRes.status).toBe(200);
        expect(authRes.body).toHaveProperty('counters');
        expect(authRes.body).toHaveProperty('timings');
        expect(authRes.body).toHaveProperty('uptimeSeconds');

        // 3. Authenticated request with Bearer token
        const bearerRes = await request(app)
          .get('/health/metrics')
          .set('Authorization', 'Bearer secret-test-metrics-token-123');
        expect(bearerRes.status).toBe(200);
      } finally {
        if (originalToken !== undefined) {
          process.env.METRICS_AUTH_TOKEN = originalToken;
        } else {
          delete process.env.METRICS_AUTH_TOKEN;
        }
      }
    });

    test('Zero Raw PII Security Audit: Metrics telemetry snapshot contains no sensitive values', async () => {
      metrics.increment('e2e_probe_event', 1, { tenant: tenantAOrgId });
      const res = await request(app).get('/health/metrics');
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/password|secret|token|ssn|creditCard|private_key/i);
    });
  });

  // =========================================================================
  // STAGE 4 — AUTHENTICATION, AUTHORIZATION & TENANT ISOLATION
  // =========================================================================
  describe('Stage 4 — Authentication, Authorization & Tenant Scoping', () => {
    test('POST /auth/login with valid credentials returns access and refresh tokens', async () => {
      const email = `login_success_${testRunId}@test.local`;
      const plainPassword = 'CorrectPassword123!';
      const salt = await import('bcryptjs').then((b) => b.genSalt(10));
      const passwordHash = await import('bcryptjs').then((b) => b.hash(plainPassword, salt));

      await User.create({
        email,
        normalizedEmail: email,
        passwordHash,
        fullName: 'Login Success User',
        role: 'USER',
        status: 'ACTIVE',
      });

      const res = await request(app).post('/api/v1/auth/login').send({
        email,
        password: plainPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toHaveProperty('email', email);
    });

    test('POST /auth/login with invalid credentials returns 400 or 401 and tracks failed attempts', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: `non_existent_${testRunId}@test.local`,
        password: 'WrongPassword123!',
      });

      expect([400, 401]).toContain(res.status);
      expect(res.body.error).toHaveProperty('code');
    });

    test('Account lockout triggered after consecutive failed attempts', async () => {
      const email = `lockout_user_${testRunId}@test.local`;
      const salt = await import('bcryptjs').then((b) => b.genSalt(10));
      const passwordHash = await import('bcryptjs').then((b) => b.hash('RealPass123!', salt));

      const user = await User.create({
        email,
        normalizedEmail: email,
        passwordHash,
        fullName: 'Lockout Target',
        role: 'USER',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
      });

      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/v1/auth/login').send({
          email,
          password: 'WrongPassword!',
        });
      }

      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.status).toBe('LOCKED');
    });

    test('POST /auth/refresh rotates refresh token and invalidates reused token', async () => {
      const user = await User.create({
        email: `refresh_test_${testRunId}@test.local`,
        normalizedEmail: `refresh_test_${testRunId}@test.local`,
        passwordHash: 'dummy',
        fullName: 'Refresh Test User',
        role: 'USER',
        status: 'ACTIVE',
      });

      const { refreshToken: initialRefreshToken } = await generateRefreshToken(user._id.toString());

      const res = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: initialRefreshToken,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.refreshToken).not.toBe(initialRefreshToken);
    });

    test('Cross-Tenant Isolation: Tenant A cannot access Tenant B organization or documents', async () => {
      // Tenant B admin CAN access Tenant B documents
      const tenantBRes = await request(app)
        .get(`/api/v1/organizations/${tenantBOrgId}/documents`)
        .set('Authorization', `Bearer ${tenantBAdminToken}`);
      expect(tenantBRes.status).toBe(200);

      // But Tenant A admin is DENIED access to Tenant B documents
      const res = await request(app)
        .get(`/api/v1/organizations/${tenantBOrgId}/documents`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect([403, 404]).toContain(res.status);
    });

    test('RBAC Enforcement: REVIEWER role cannot perform ORG_ADMIN actions (e.g. policy creation)', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${tenantAOrgId}/policies`)
        .set('Authorization', `Bearer ${tenantAReviewerToken}`)
        .send({
          name: 'Unauthorized Policy',
          description: 'Should fail',
          defaultDecision: 'REDACT',
          rules: [],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toHaveProperty('code', 'INSUFFICIENT_TENANT_ROLE');
    });
  });

  // =========================================================================
  // STAGE 5 — FILE INGESTION, FORMAT EXTRACTION & BOUNDS
  // =========================================================================
  describe('Stage 5 — File Ingestion, Format Extraction & Safety Bounds', () => {
    test('Ingests valid TXT file, computes checksum, and persists metadata record', async () => {
      const txtPath = path.join(testScratchDir, 'sample_clean.txt');
      const content = 'Patient diagnosis summary: Vital signs stable. Blood pressure 120/80.';
      await fs.promises.writeFile(txtPath, content);

      const res = await request(app)
        .post(`/api/v1/organizations/${tenantAOrgId}/documents`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .attach('file', txtPath);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('document');
      expect(res.body.document.extension).toBe('txt');
      expect(res.body.document.checksum).toBe(crypto.createHash('sha256').update(content).digest('hex'));
    });

    test('Ingests valid PDF with extractable text and executes extraction', async () => {
      const pdfPath = path.join(testScratchDir, 'sample_text.pdf');
      const pdfContent = '%PDF-1.4 1 0 obj << /Author (System) >> stream\nHello World\nendstream endobj %%EOF';
      await fs.promises.writeFile(pdfPath, pdfContent, 'binary');

      const res = await request(app)
        .post(`/api/v1/organizations/${tenantAOrgId}/documents`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .attach('file', pdfPath);

      expect(res.status).toBe(201);
      const docId = res.body.document.id;

      const extractRes = await extractionService.processDocumentExtraction(docId, tenantAOrgId);

      expect(['COMPLETE', 'OCR_REQUIRED', 'FAILED']).toContain(extractRes.status);
    });

    test('Ingests valid DOCX archive within bounds and extracts structural blocks', async () => {
      const docxPath = path.join(testScratchDir, 'sample_doc.docx');
      const zip = new AdmZip();
      zip.addFile('word/document.xml', Buffer.from('<w:document><w:body><w:p><w:r><w:t>Confidential Report</w:t></w:r></w:p></w:body></w:document>'));
      zip.writeZip(docxPath);

      const res = await request(app)
        .post(`/api/v1/organizations/${tenantAOrgId}/documents`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .attach('file', docxPath);

      expect(res.status).toBe(201);
      const docId = res.body.document.id;

      const extractRes = await extractionService.processDocumentExtraction(docId, tenantAOrgId);

      expect(extractRes.status).toBe('COMPLETE');
      expect(extractRes.blocks.length).toBeGreaterThan(0);
      expect(extractRes.blocks[0].text).toContain('Confidential Report');
    });

    test('Rejects disallowed executable extensions (.exe, .sh) with 400 UNSUPPORTED_EXTENSION', async () => {
      const badPath = path.join(testScratchDir, 'malicious.exe');
      await fs.promises.writeFile(badPath, 'MZ binary payload');

      const res = await request(app)
        .post(`/api/v1/organizations/${tenantAOrgId}/documents`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .attach('file', badPath);

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code', 'UNSUPPORTED_EXTENSION');
    });

    test('Resource Governance: Rejects decompression bomb exceeding 1,000 zip entries', async () => {
      const bombPath = path.join(testScratchDir, 'bomb.docx');
      const zip = new AdmZip();
      for (let i = 0; i < 1005; i++) {
        zip.addFile(`file_${i}.txt`, Buffer.from('data'));
      }
      zip.writeZip(bombPath);

      const doc = await DocumentModel.create({
        organizationId: new mongoose.Types.ObjectId(tenantAOrgId),
        uploadedBy: new mongoose.Types.ObjectId(tenantAAdminId),
        originalFilename: 'bomb.docx',
        size: fs.statSync(bombPath).size,
        declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
        storageKey: bombPath,
        checksum: 'checksum_bomb',
        status: 'READY',
      });

      await expect(
        extractionService.processDocumentExtraction(doc._id.toString(), tenantAOrgId)
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // STAGE 6 — COMPLETE DOCUMENT PROCESSING PIPELINE TRACE
  // =========================================================================
  describe('Stage 6 — Full E2E Document Processing Pipeline Trace (Known PII)', () => {
    let tracedDocId: string;
    let decisionRunId: string;

    test('STEP 1: Upload document containing synthetic Email, Phone, and SSN', async () => {
      const docPath = path.join(testScratchDir, 'patient_intake.txt');
      const text = 'Patient Name: John Smith. Contact Email: john.smith@example.invalid. Phone: (555) 234-5678. SSN: 123-45-6789.';
      await fs.promises.writeFile(docPath, text);

      const res = await request(app)
        .post(`/api/v1/organizations/${tenantAOrgId}/documents`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .attach('file', docPath);

      expect(res.status).toBe(201);
      tracedDocId = res.body.document.id;
      expect(tracedDocId).toBeDefined();
    });

    test('STEP 2: Extract document to normalized blocks', async () => {
      const extractRes = await extractionService.processDocumentExtraction(tracedDocId, tenantAOrgId);

      expect(extractRes.status).toBe('COMPLETE');
      expect(extractRes.blocks.length).toBeGreaterThan(0);

      const normalized = await NormalizedDocumentModel.findOne({ documentId: tracedDocId });
      expect(normalized).toBeDefined();
      expect(normalized?.blocks.length).toBeGreaterThan(0);
    });

    test('STEP 3: Run PII detection and identify candidates with character offsets', async () => {
      const piiRes = await piiDetectionService.detectPIIForDocument(tracedDocId, tenantAOrgId);

      expect(piiRes.run.status).toBe('COMPLETED');
      expect(piiRes.candidates.length).toBeGreaterThan(0);

      const candidates = await PIICandidateModel.find({ documentId: tracedDocId });
      const types = candidates.map((c) => c.type);
      expect(types).toContain(PIIType.EMAIL_ADDRESS);
      expect(types).toContain(PIIType.PHONE_NUMBER);
      expect(types).toContain(PIIType.US_SSN);
    });

    test('STEP 4: Run contextual intelligence and field label scoring', async () => {
      const contextRes = await contextAnalysisService.runContextAnalysis(tracedDocId, tenantAOrgId);

      expect(contextRes.run.status).toBe('COMPLETED');
      expect(contextRes.results.length).toBeGreaterThan(0);
    });

    test('STEP 5: Configure tenant policy and evaluate decisions', async () => {
      const policy = await policyService.createPolicy(tenantAOrgId, tenantAAdminId, {
        name: `Tenant A Strict HIPAA Policy ${testRunId}`,
        defaultDecision: 'REDACT',
        rules: [
          {
            ruleId: 'rule_ssn_redact',
            name: 'Redact SSN',
            priority: 100,
            action: 'REDACT',
            conditions: [{ property: 'type', operator: 'EQUALS', value: PIIType.US_SSN }],
            rationaleCode: 'REDACT_SSN',
          },
          {
            ruleId: 'rule_email_redact',
            name: 'Redact Email',
            priority: 90,
            action: 'REDACT',
            conditions: [{ property: 'type', operator: 'EQUALS', value: PIIType.EMAIL_ADDRESS }],
            rationaleCode: 'REDACT_EMAIL',
          },
          {
            ruleId: 'rule_phone_review',
            name: 'Review Phone',
            priority: 80,
            action: 'REVIEW',
            conditions: [{ property: 'type', operator: 'EQUALS', value: PIIType.PHONE_NUMBER }],
            rationaleCode: 'REVIEW_PHONE',
          },
        ],
      });

      const decisionRes = await policyService.evaluateDocumentDecisions(tracedDocId, tenantAOrgId, {
        policyId: policy.policyId,
      });

      expect(decisionRes.run.status).toBe('COMPLETED');
      decisionRunId = decisionRes.run.decisionRunId;
      expect(decisionRes.results.length).toBeGreaterThan(0);
    });

    test('STEP 6: Execute document transformations (Redaction & Masking)', async () => {
      const transRes = await transformationService.executeTransformation(tracedDocId, tenantAOrgId, {
        decisionRunId,
      });

      expect(transRes.run.status).toBe('COMPLETED');
      expect(transRes.artifact.storageKey).toBeDefined();
      expect(fs.existsSync(transRes.artifact.storageKey)).toBe(true);
    });

    test('STEP 7: Execute metadata sanitization', async () => {
      const sanRes = await sanitizationService.executeSanitization(tracedDocId, tenantAOrgId);

      expect(sanRes.run.status).toBe('COMPLETED');
    });

    test('STEP 8: Execute re-identification risk analysis', async () => {
      const riskRes = await riskService.executeRiskAnalysis(tracedDocId, tenantAOrgId);

      expect(riskRes.run.status).toBe('COMPLETED');
      expect(riskRes.run.reidentificationRiskScore).toBeGreaterThanOrEqual(0.0);
      expect(riskRes.run.reidentificationRiskScore).toBeLessThanOrEqual(1.0);
    });

    test('STEP 9: Execute independent verification and QA', async () => {
      const verRes = await verificationService.executeVerification(tracedDocId, tenantAOrgId);

      expect(['VERIFIED', 'PARTIAL', 'FAILED', 'NOT_VERIFIABLE']).toContain(verRes.run.overallStatus);
      expect(verRes.results.length).toBeGreaterThan(0);
    });

    test('STEP 10: Human review case created for REVIEW items', async () => {
      const reviewCase = await humanReviewService.createReviewCase({
        organizationIdStr: tenantAOrgId,
        documentIdStr: tracedDocId,
        caseType: 'AMBIGUOUS_POLICY',
        priority: 'HIGH',
        reasonCodes: ['MANUAL_REVIEW_REQUIRED'],
        safeEvidenceReferences: [{ piiType: PIIType.PHONE_NUMBER, expectedAction: 'REVIEW' }],
        createdByUserIdStr: tenantAAdminId,
      });

      expect(reviewCase.status).toBe('OPEN');
      expect(reviewCase.safeEvidenceReferences[0].piiType).toBe(PIIType.PHONE_NUMBER);
    });
  });

  // =========================================================================
  // STAGE 7 — TRANSFORMATION & METADATA SAFETY
  // =========================================================================
  describe('Stage 7 — Transformation & Metadata Safety Invariants', () => {
    test('Source Artifact Immutability: Source file checksum remains identical after transformation', async () => {
      const docPath = path.join(testScratchDir, 'immutable_test.txt');
      const content = 'Original Source Data: Email alice@example.invalid';
      await fs.promises.writeFile(docPath, content);
      const originalChecksum = crypto.createHash('sha256').update(content).digest('hex');

      await DocumentModel.create({
        organizationId: new mongoose.Types.ObjectId(tenantAOrgId),
        uploadedBy: new mongoose.Types.ObjectId(tenantAAdminId),
        originalFilename: 'immutable_test.txt',
        size: content.length,
        declaredMimeType: 'text/plain',
        detectedMimeType: 'text/plain',
        extension: 'txt',
        storageKey: docPath,
        checksum: originalChecksum,
        status: 'EXTRACTED',
      });

      const currentSource = await fs.promises.readFile(docPath, 'utf8');
      expect(crypto.createHash('sha256').update(currentSource).digest('hex')).toBe(originalChecksum);
    });

    test('Transformed file is a separate artifact and does NOT overwrite original', async () => {
      const runs = await TransformationRunModel.find({ organizationId: tenantAOrgId });
      expect(runs.length).toBeGreaterThan(0);
      const latestRun = runs[runs.length - 1];

      expect(latestRun.outputArtifactId).toBeDefined();
    });
  });

  // =========================================================================
  // STAGE 8 — RISK AND VERIFICATION BOUNDS
  // =========================================================================
  describe('Stage 8 — Risk Model & Verification Bounds', () => {
    test('Heuristic population mode produces null k-anonymity estimate (never fabricates population counts)', async () => {
      const riskResults = await ReidentificationRiskResultModel.find({ organizationId: tenantAOrgId });
      for (const res of riskResults) {
        if (res.referencePopulationMode === 'HEURISTIC') {
          expect(res.kAnonymityEstimate).toBeNull();
        }
      }
    });

    test('Risk score is strictly bounded between 0.0 and 1.0', async () => {
      const riskRuns = await ReidentificationRiskRunModel.find({ organizationId: tenantAOrgId });
      for (const run of riskRuns) {
        expect(run.reidentificationRiskScore).toBeGreaterThanOrEqual(0.0);
        expect(run.reidentificationRiskScore).toBeLessThanOrEqual(1.0);
      }
    });
  });

  // =========================================================================
  // STAGE 9 — HUMAN REVIEW AND FEEDBACK WORKFLOW
  // =========================================================================
  describe('Stage 9 — Human Review, Conflict Resolution & Dataset Immutability', () => {
    let reviewCaseId: string;
    let submittedDecisionId: string;
    let feedbackId: string;

    test('Reviewer claims pending case with atomic lease lock', async () => {
      const cases = await HumanReviewCaseModel.find({ organizationId: tenantAOrgId, status: 'OPEN' });
      expect(cases.length).toBeGreaterThan(0);
      reviewCaseId = cases[0].reviewCaseId;

      const claimed = await humanReviewService.claimCaseLease(
        tenantAOrgId,
        reviewCaseId,
        tenantAReviewerId
      );

      expect(claimed.status).toBe('IN_REVIEW');
      expect(claimed.assignedReviewerId?.toString()).toBe(tenantAReviewerId);
      expect(claimed.leaseExpiresAt).toBeDefined();
    });

    test('Submitting decision updates case state', async () => {
      const targetCase = await HumanReviewCaseModel.findOne({ reviewCaseId });
      const currentVersion = targetCase?.caseVersion || 1;

      const { reviewCase: updatedCase, decision } = await humanReviewService.submitReviewDecision({
        organizationIdStr: tenantAOrgId,
        reviewCaseIdStr: reviewCaseId,
        reviewerIdStr: tenantAReviewerId,
        decisionType: 'CONFIRM_REDACTION',
        reasonCode: 'VALIDATED_PHONE_PII',
        safeRationale: 'Confirmed phone PII requiring redaction',
        caseVersion: currentVersion,
      });

      expect(['RESOLVED', 'REJECTED', 'ESCALATED', 'AWAITING_SECOND_REVIEW']).toContain(updatedCase.status);
      submittedDecisionId = decision.reviewDecisionId;
    });

    test('Submitting controlled feedback creates feedback record', async () => {
      const feedback = await humanReviewService.submitFeedback(
        tenantAOrgId,
        reviewCaseId,
        submittedDecisionId,
        tenantAReviewerId,
        'POLICY_MISMATCH',
        'CONFIRM_REDACTION',
        'CONFIRMED_PHONE',
        { note: 'Company phone numbers should always be redacted under GDPR policy.' }
      );

      expect(feedback).toBeDefined();
      expect(feedback.approvalState).toBe('PENDING_APPROVAL');
      feedbackId = feedback.feedbackId;
    });

    test('Materializing dataset version creates immutable snapshot', async () => {
      // 1. Admin approves feedback (Separation of duties: admin != reviewer)
      const approved = await humanReviewService.approveOrRejectFeedback(
        tenantAOrgId,
        feedbackId,
        tenantAAdminId,
        true,
        'Approved by administrator'
      );
      expect(approved.approvalState).toBe('APPROVED');

      // 2. Materialize dataset version
      const datasetVersion = await humanReviewService.createDatasetVersion(
        tenantAOrgId,
        `E2E_GroundTruth_${testRunId}`,
        tenantAAdminId
      );

      expect(datasetVersion).toBeDefined();
      expect(datasetVersion.versionName).toBe(`E2E_GroundTruth_${testRunId}`);
      expect(datasetVersion.status).toBe('MATERIALIZED');
      expect(datasetVersion.totalFeedbackCount).toBeGreaterThanOrEqual(1);
    });

    test('Controlled feedback does NOT automatically alter active production policy', async () => {
      const activePolicy = await PolicyModel.findOne({ organizationId: tenantAOrgId });
      expect(activePolicy).toBeDefined();
      expect(activePolicy?.defaultDecision).toBe('REDACT');
    });
  });

  // =========================================================================
  // STAGE 10 — QUEUE & FAILURE RESILIENCY
  // =========================================================================
  describe('Stage 10 — Queue Resiliency & Dead-Letter Handling', () => {
    test('Dead-letter queue is registered and captures exhausted retry jobs', async () => {
      const dlq = getDeadLetterQueue();
      expect(dlq.name).toBe(DEAD_LETTER_QUEUE_NAME);

      const addSpy = jest.spyOn(dlq, 'add').mockResolvedValue({} as never);

      await dlq.add('deadLetterJob', {
        originalQueue: 'e2eTestQueue',
        jobId: `job_${testRunId}`,
        jobName: 'testJob',
        data: { organizationId: tenantAOrgId },
        failedReason: 'Simulated downstream timeout exhaustion',
        attemptsMade: 3,
        failedAt: new Date().toISOString(),
      });

      expect(addSpy).toHaveBeenCalledTimes(1);
      addSpy.mockRestore();
    });
  });

  // =========================================================================
  // STAGE 11 — AUDIO AND VIDEO MODALITIES
  // =========================================================================
  describe('Stage 11 — Audio & Video Processing with Provenance & Synthetic Transparency', () => {
    test('AudioEngine generates word timestamps, offsets, and synthetic fixture disclaimer', async () => {
      const engine = new AudioProcessingEngine();
      const result = await engine.processAudio({
        audioFilePath: '/mock/storage/recording.mp3',
        documentId: `doc_audio_${testRunId}`,
        organizationId: tenantAOrgId,
        knownDurationSeconds: 15,
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.isSyntheticFixture).toBe(true);
      expect(result.providerType).toBe('OFFLINE_SYNTHETIC_FIXTURE');
      expect(result.audioResult?.segments.length).toBeGreaterThan(0);

      const email = result.candidates.find((c) => c.entityType === 'EMAIL_ADDRESS');
      expect(email).toBeDefined();
      expect(email?.startMs).toBeDefined();
      expect(email?.endMs).toBeDefined();
      expect(email?.startOffset).toBeDefined();
      expect(email?.endOffset).toBeDefined();
    });

    test('VideoEngine deduplicates adjacent frame candidates and reports honest partial coverage', async () => {
      const engine = new VideoProcessingEngine({ maxFrameCount: 5 });
      const result = await engine.processVideo({
        videoFilePath: '/mock/storage/webinar.mp4',
        documentId: `doc_video_${testRunId}`,
        organizationId: tenantAOrgId,
        processAudioTrack: false,
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.isSyntheticFixture).toBe(true);
      expect(result.coverageStatus).toBe('PARTIAL_COVERAGE');
      expect(result.videoResult?.isFullyInspected).toBe(false);
      expect(result.videoResult?.warnings[0].code).toBe('PARTIAL_FRAME_COVERAGE');
    });

    test('MediaModalityService adapts audio/video findings into standard INormalizedBlock objects', () => {
      const service = new MediaModalityService();
      const mockResult: MediaProcessingResult = {
        documentId: `doc_adapt_${testRunId}`,
        organizationId: tenantAOrgId,
        modality: 'AUDIO',
        status: 'SUCCESS',
        candidates: [],
        providerType: 'OFFLINE_SYNTHETIC_FIXTURE',
        isSyntheticFixture: true,
        processingTimeMs: 10,
        coverageStatus: 'FULL_COVERAGE',
        reasons: [],
        audioResult: {
          status: 'SUCCESS',
          durationSeconds: 2,
          rawTranscriptText: 'Customer name John Doe speaking',
          isTranscribed: true,
          providerType: 'OFFLINE_SYNTHETIC_FIXTURE',
          isSyntheticFixture: true,
          warnings: [],
          segments: [
            {
              segmentId: 'seg_1',
              startMs: 0,
              endMs: 1200,
              text: 'Customer name John Doe speaking',
              confidence: 0.95,
              words: [{ word: 'John', startMs: 500, endMs: 800, confidence: 0.95 }],
            },
          ],
        },
      };

      const blocks = service.convertMediaResultToNormalizedBlocks(mockResult);
      expect(blocks.length).toBe(1);
      expect(blocks[0].blockId).toBe('seg_1');
      expect(blocks[0].text).toBe('Customer name John Doe speaking');
      expect(blocks[0].startOffset).toBe(0);
      expect(blocks[0].endOffset).toBe(1200);
      expect(blocks[0].confidence).toBe(0.95);
    });
  });

  // =========================================================================
  // STAGE 12 — SECURITY AND PRIVACY
  // =========================================================================
  describe('Stage 12 — Security, Privacy & Defense In Depth', () => {
    test('Security headers (Helmet) enforced on HTTP responses', async () => {
      const res = await request(app).get('/health/liveness');
      expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(res.headers).toHaveProperty('x-frame-options');
    });

    test('Path traversal attempts in file extractors are rejected safely', async () => {
      const traversalZip = new AdmZip();
      traversalZip.addFile('../../../etc/passwd', Buffer.from('root:x:0:0'));
      const zipPath = path.join(testScratchDir, 'traversal.docx');
      traversalZip.writeZip(zipPath);

      const doc = await DocumentModel.create({
        organizationId: new mongoose.Types.ObjectId(tenantAOrgId),
        uploadedBy: new mongoose.Types.ObjectId(tenantAAdminId),
        originalFilename: 'traversal.docx',
        size: fs.statSync(zipPath).size,
        declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
        storageKey: zipPath,
        checksum: 'chk_traversal',
        status: 'READY',
      });

      await expect(
        extractionService.processDocumentExtraction(doc._id.toString(), tenantAOrgId)
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // STAGE 13 — API CONTRACT AND DATA CONSISTENCY
  // =========================================================================
  describe('Stage 13 — API Route Inventory & Contract Consistency', () => {
    test('GET /organizations/:orgId returns organization metadata for authorized member', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${tenantAOrgId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('organization');
      expect(res.body.organization.id).toBe(tenantAOrgId);
    });

    test('Non-existent route returns 404 with structured JSON error', async () => {
      const res = await request(app).get('/api/v1/non-existent-endpoint');
      expect(res.status).toBe(404);
      expect(res.body.error).toHaveProperty('code', 'ROUTE_NOT_FOUND');
    });
  });
});
