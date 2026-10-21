import request from 'supertest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { connectDatabase } from '../src/config/database';
import { connectRedis } from '../src/config/redis';
import { validateEnv } from '../src/config/env';
import { Organization } from '../src/models/organization.model';
import { User } from '../src/models/user.model';
import { OrganizationMembership } from '../src/models/membership.model';
import { generateAccessToken } from '../src/services/token.service';
import { extractionService } from '../src/services/extraction.service';
import { piiDetectionService } from '../src/services/pii/piiDetection.service';
import { contextAnalysisService } from '../src/services/context/contextAnalysis.service';
import { policyService } from '../src/services/policy/policy.service';
import { transformationService } from '../src/services/transformation/transformation.service';
import { sanitizationService } from '../src/services/sanitization/sanitization.service';
import { riskService } from '../src/services/risk/risk.service';
import { verificationService } from '../src/services/verification/verification.service';
import { EvidenceAggregator } from '../src/detection/evidenceAggregator';

async function runLiveDemonstration() {
  console.log('\n================================================================================');
  console.log('       LIVE DEMONSTRATION AUDIT: FULL REAL-WORLD PIPELINE EXECUTION             ');
  console.log('       UPLOAD -> DETECT -> REVIEW -> REDACT -> VERIFY -> DOWNLOAD               ');
  console.log('================================================================================\n');

  validateEnv();
  await connectDatabase('mongodb://127.0.0.1:27017/pii_platform_test');
  await connectRedis();

  const app = createApp();
  const runTag = `audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const scratchDir = path.resolve(process.cwd(), 'scratch', runTag);
  await fs.promises.mkdir(scratchDir, { recursive: true });

  // 1. Setup Tenant and Auth
  const adminEmail = `privacy.officer.${runTag}@metrohealth.example`.toLowerCase();
  const adminUser = await User.create({
    email: adminEmail,
    normalizedEmail: adminEmail,
    passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/r6E/j62iF9LzH9m9i.1.2.3',
    fullName: 'Chief Privacy Officer',
    role: 'ORG_ADMIN',
    status: 'ACTIVE',
  });
  const adminId = adminUser._id.toString();

  const orgName = `Metropolitan Healthcare System ${runTag}`;
  const org = await Organization.create({
    name: orgName,
    normalizedName: orgName.toLowerCase(),
    slug: `metro-health-${runTag}`,
    createdBy: adminUser._id,
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
  });
  const orgId = org._id.toString();

  await OrganizationMembership.create({
    organizationId: orgId,
    userId: adminId,
    role: 'ORG_ADMIN',
    status: 'ACTIVE',
  });

  const adminToken = generateAccessToken({
    userId: adminId,
    email: adminUser.email,
    globalRole: 'USER',
    tenantMemberships: [{ organizationId: orgId, role: 'ORG_ADMIN' }],
  });

  // Create default tenant policy
  const defaultPolicy = await policyService.createPolicy(orgId, adminId, {
    name: `Default Strict Clinical Policy ${runTag}`,
    description: 'Enforces strict redaction of clinical PII with precision whitelist',
    defaultDecision: 'REDACT',
    rules: [
      {
        ruleId: 'rule_redact_all_detected_pii',
        name: 'Redact All Detected PII',
        priority: 10,
        action: 'REDACT',
        rationaleCode: 'REDACT_ALL_DETECTED_PII',
        conditions: [
          {
            property: 'type',
            operator: 'EXISTS',
            value: true,
          },
        ],
      },
    ],
  });
  const policyId = defaultPolicy.policyId;

  // 2. Generate a Completely NEW Real-World Medical Document (Zero Mock Data)
  const newDocumentText = `================================================================================
           ST. JUDE METROPOLITAN HOSPITAL - DISCHARGE & SETTLEMENT
================================================================================
Facility Name: St. Jude Metropolitan Healthcare System
Department: Advanced Cardiac Care, Building C
Hospital Registration ID: HOSP-REG-2026-99182

CLINICAL & PATIENT DETAILS:
Patient Name: Meera Nambiar
Date of Birth: 14/07/1986
Primary Contact Mobile: +91 94471 23456
Personal Email Address: meera.nambiar86@healthnet.example
Residential Address: 74 Marine Hill Road, Kochi, Kerala
Income Tax PAN: BZRPN7821K
Emergency Billing Card: 4111 1111 1111 1111
Attending Physician: Dr. Devashish Roy
Physician Notes: Patient recovered with standard medication regimen.

ADMINISTRATIVE & COMMERCIAL RECORDS:
Billing Reference: INV-2026-88129
Diagnostic Equipment Code: ECG-DEVICE-9081
Public Inquiries Desk: support@stjude-hospital.example
Hospital Billing Office: billing@stjude-hospital.example
Terms of Admission: Governed by statutory public healthcare policies.
================================================================================`;

  const inputFilePath = path.join(scratchDir, 'live_patient_discharge.txt');
  await fs.promises.writeFile(inputFilePath, newDocumentText, 'utf-8');
  const inputHash = crypto.createHash('sha256').update(newDocumentText).digest('hex');

  console.log(`[STAGE 1: GENERATE NEW DOCUMENT]`);
  console.log(`  - File Name: live_patient_discharge.txt`);
  console.log(`  - File Size: ${Buffer.byteLength(newDocumentText)} bytes`);
  console.log(`  - SHA-256 Checksum: ${inputHash}`);
  console.log(`  - Ground-Truth PII in document:`);
  console.log(`      * Meera Nambiar (PERSON_NAME)`);
  console.log(`      * 14/07/1986 (DATE_OF_BIRTH)`);
  console.log(`      * +91 94471 23456 (PHONE_NUMBER)`);
  console.log(`      * meera.nambiar86@healthnet.example (EMAIL_ADDRESS)`);
  console.log(`      * 74 Marine Hill Road, Kochi, Kerala (STREET_ADDRESS)`);
  console.log(`      * BZRPN7821K (PAN_NUMBER)`);
  console.log(`      * 4111 1111 1111 1111 (CREDIT_CARD)`);
  console.log(`      * Devashish Roy (PERSON_NAME)`);
  console.log(`  - Ground-Truth Non-PII (Precision Guards):`);
  console.log(`      * St. Jude Metropolitan Healthcare System (Corporate Entity)`);
  console.log(`      * INV-2026-88129 (Invoice code)`);
  console.log(`      * ECG-DEVICE-9081 (Product ID)`);
  console.log(`      * support@stjude-hospital.example (Generic corporate email)`);
  console.log(`      * billing@stjude-hospital.example (Generic billing email)\n`);

  // STAGE 1: UPLOAD
  console.log(`[STAGE 2: UPLOAD] Uploading document to POST /api/v1/organizations/${orgId}/documents ...`);
  const uploadRes = await request(app)
    .post(`/api/v1/organizations/${orgId}/documents`)
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', inputFilePath);

  if (uploadRes.status !== 201) {
    throw new Error(`Upload failed with status ${uploadRes.status}: ${JSON.stringify(uploadRes.body)}`);
  }

  const docId = uploadRes.body.document.id;
  console.log(`  ✓ Document successfully uploaded.`);
  console.log(`  ✓ Document ID: ${docId}`);
  console.log(`  ✓ Stored MIME Type: ${uploadRes.body.document.mimeType}`);
  console.log(`  ✓ Storage Checksum: ${uploadRes.body.document.checksumSha256}\n`);

  // STAGE 2: EXTRACT
  console.log(`[STAGE 3: EXTRACT] Extracting structured text content ...`);
  const extractRes = await extractionService.processDocumentExtraction(docId, orgId);
  console.log(`  ✓ Extraction Status: ${extractRes.status}`);
  console.log(`  ✓ Extracted Blocks Count: ${extractRes.blocks.length}`);
  console.log(`  ✓ Total Extracted Characters: ${extractRes.blocks.reduce((acc, b) => acc + (b.text?.length || 0), 0)}\n`);

  // STAGE 3: DETECT
  console.log(`[STAGE 4: DETECT] Running multi-signal PII detectors & Evidence Aggregator ...`);
  const detectRes = await piiDetectionService.detectPIIForDocument(docId, orgId);
  console.log(`  ✓ Upstream Raw Candidates Found: ${detectRes.candidates.length}`);

  // Convert to candidate inputs and execute Evidence Aggregation
  const candidateInputs = detectRes.candidates.map((c) => ({
    candidateId: c.candidateId,
    type: c.type,
    label: c.type,
    value: c.text,
    startOffset: c.location?.startOffset,
    endOffset: c.location?.endOffset,
    detector: c.sourceDetector || 'RegexEngine',
    confidence: c.confidenceScore || 0.9,
    evidence: [`Raw signal from ${c.sourceDetector || 'Deterministic'}`],
    reason: `Detected via ${c.sourceDetector || 'Pattern'}`,
  }));

  const aggregatedCandidates = EvidenceAggregator.aggregateAndDecide(
    newDocumentText,
    candidateInputs,
    { documentTypeOverride: 'MEDICAL' }
  );

  console.log(`  ✓ Aggregated & Evaluated Decisions Breakdown:`);
  for (const c of aggregatedCandidates) {
    const symbol = c.decision === 'REDACT' ? '[REDACT]' : c.decision === 'REVIEW' ? '[REVIEW]' : '[KEEP]';
    console.log(`    - ${symbol.padEnd(8)} "${c.value}" (${c.type})`);
    console.log(`        Score: ${c.confidence} | Context: ${c.contextScore} | Agreement: x${c.detectorAgreement} signal(s)`);
    console.log(`        Evidence: ${c.evidence.map(e => e.reason).join('; ')}`);
  }
  console.log('');

  // STAGE 4: REVIEW & DECISION
  console.log(`[STAGE 5: REVIEW] Evaluating policy decisions ...`);
  await contextAnalysisService.runContextAnalysis(docId, orgId);
  const decisionRes = await policyService.evaluateDocumentDecisions(docId, orgId, { policyId });
  console.log(`  ✓ Decision Run ID: ${decisionRes.run.decisionRunId}`);
  console.log(`  ✓ Overall Policy Decision: ${decisionRes.run.overallDecision}`);
  console.log(`  ✓ Actionable Decisions Count: ${decisionRes.results.length}\n`);

  // STAGE 5: REDACT (TRANSFORMATION)
  console.log(`[STAGE 6: REDACT] Executing physical redaction transform ...`);
  const transRes = await transformationService.executeTransformation(docId, orgId, {
    decisionRunId: decisionRes.run.decisionRunId,
    operation: 'REDACTION',
  });
  console.log(`  ✓ Transformation Status: ${transRes.run.status}`);
  console.log(`  ✓ Redactions Applied: ${transRes.run.transformedCount}`);
  console.log(`  ✓ Transformed Output Artifact ID: ${transRes.artifact.artifactId}\n`);

  // STAGE 6: SANITIZE
  console.log(`[STAGE 7: SANITIZE] Executing metadata & structural sanitization ...`);
  const sanRes = await sanitizationService.executeSanitization(docId, orgId);
  console.log(`  ✓ Sanitization Status: ${sanRes.run.status}`);
  console.log(`  ✓ Discovered Metadata Attributes: ${sanRes.run.discoveredCount}`);
  console.log(`  ✓ Sanitized Output Artifact ID: ${sanRes.artifact.artifactId}\n`);

  // STAGE 7: VERIFY
  console.log(`[STAGE 8: VERIFY] Running independent forensic verification engine ...`);
  await riskService.executeRiskAnalysis(docId, orgId);
  const verRes = await verificationService.executeVerification(docId, orgId);
  console.log(`  ✓ Verification Status: ${verRes.run.status}`);
  console.log(`  ✓ Overall Verification Status: ${verRes.run.overallStatus}`);
  console.log(`  ✓ Total Verifiers Evaluated: ${verRes.run.totalVerifierCount}`);
  console.log(`  ✓ Passed Verifiers Count: ${verRes.run.passedVerifierCount}`);
  console.log(`  ✓ Failed Verifiers Count: ${verRes.run.failedVerifierCount}`);
  console.log(`  ✓ Individual Verifier Audit:`);
  for (const r of verRes.results) {
    const mark = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`      * ${mark.padEnd(8)} ${r.verifierType.padEnd(30)}: ${r.reasonCode} - ${r.explanation}`);
  }
  console.log('');

  if (verRes.run.overallStatus !== 'VERIFIED') {
    throw new Error(`Verification did not pass: ${JSON.stringify(verRes.results.filter(r => !r.passed))}`);
  }

  // STAGE 8: DOWNLOAD
  console.log(`[STAGE 9: DOWNLOAD] Downloading and inspecting final verified artifact ...`);
  const downloadRes = await request(app)
    .get(`/api/v1/organizations/${orgId}/documents/${docId}/download?transformed=true`)
    .set('Authorization', `Bearer ${adminToken}`);

  if (downloadRes.status !== 200) {
    throw new Error(`Download failed with status ${downloadRes.status}`);
  }

  const downloadedContent = downloadRes.text || downloadRes.body.toString('utf-8');
  const downloadedHash = crypto.createHash('sha256').update(downloadedContent).digest('hex');

  console.log(`  ✓ Download Successful (HTTP 200 OK)`);
  console.log(`  ✓ Downloaded File Size: ${Buffer.byteLength(downloadedContent)} bytes`);
  console.log(`  ✓ Output SHA-256 Checksum: ${downloadedHash}`);
  console.log(`  ✓ Checksum Changed From Original: ${inputHash !== downloadedHash ? 'YES (Confirmed Physical Mutation)' : 'NO'}\n`);

  console.log('================================================================================');
  console.log('                   VERIFIED FINAL OUTPUT ARTIFACT CONTENT                       ');
  console.log('================================================================================');
  console.log(downloadedContent);
  console.log('================================================================================\n');

  // Cryptographic & Lexical Proof Assertions
  console.log('[STAGE 10: FORENSIC VERIFICATION AUDIT]');
  const sensitivePII = [
    'Meera Nambiar',
    '14/07/1986',
    '+91 94471 23456',
    'meera.nambiar86@healthnet.example',
    '74 Marine Hill Road',
    'BZRPN7821K',
    '4111 1111 1111 1111',
    'Devashish Roy',
  ];

  for (const pii of sensitivePII) {
    const leaked = downloadedContent.includes(pii);
    console.log(`  - PII Substring Check: "${pii}" -> ${leaked ? 'LEAKED ✗' : 'DESTROYED / ABSENT ✓'}`);
    if (leaked) {
      throw new Error(`CRITICAL PRIVACY VIOLATION: Sensitive PII "${pii}" found in output!`);
    }
  }

  const preservedBusinessContent = [
    'St. Jude Metropolitan Healthcare System',
    'HOSP-REG-2026-99182',
    'INV-2026-88129',
    'ECG-DEVICE-9081',
    'support@stjude-hospital.example',
    'billing@stjude-hospital.example',
  ];

  for (const biz of preservedBusinessContent) {
    const preserved = downloadedContent.includes(biz);
    console.log(`  - Business Content Check: "${biz}" -> ${preserved ? 'PRESERVED ✓' : 'OVER-REDACTED ✗'}`);
    if (!preserved) {
      throw new Error(`OVER-REDACTION VIOLATION: Legitimate business text "${biz}" was incorrectly redacted!`);
    }
  }

  console.log('\n================================================================================');
  console.log('✓ AUDIT PROOF COMPLETE: ZERO LEAKS, ZERO OVER-REDACTION, FULL PIPELINE VERIFIED ');
  console.log('================================================================================\n');

  process.exit(0);
}

runLiveDemonstration().catch((err) => {
  console.error('FATAL AUDIT ERROR:', err);
  process.exit(1);
});
