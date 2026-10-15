import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { User } from '../src/models/user.model';
import { Organization } from '../src/models/organization.model';
import { OrganizationMembership } from '../src/models/membership.model';
import { PolicyModel } from '../src/models/policy.model';
import { DocumentModel } from '../src/models/document.model';
import { HumanReviewCaseModel } from '../src/models/humanReviewCase.model';
import { ReviewDecisionModel } from '../src/models/reviewDecision.model';
import { extractionService } from '../src/services/extraction.service';
import { piiDetectionService } from '../src/services/pii/piiDetection.service';
import { contextAnalysisService } from '../src/services/context/contextAnalysis.service';
import { policyService } from '../src/services/policy/policy.service';
import { transformationService } from '../src/services/transformation/transformation.service';
import { RiskService } from '../src/services/risk/risk.service';
import { VerificationService } from '../src/services/verification/verification.service';

const riskService = new RiskService();
const verificationService = new VerificationService();

async function seed() {
  console.log('================================================================');
  console.log('       SEEDING MOCK DATA & DEMO DOCUMENTS FOR PII PLATFORM      ');
  console.log('================================================================\n');

  await connectDatabase();

  const passwordHash = await bcrypt.hash('AdminPass123!', 10);
  const reviewerPasswordHash = await bcrypt.hash('ReviewerPass123!', 10);

  // 1. Admin & Reviewer Users
  let admin = await User.findOne({ normalizedEmail: 'admin@pii-platform.local' });
  if (!admin) {
    admin = await User.create({
      email: 'admin@pii-platform.local',
      normalizedEmail: 'admin@pii-platform.local',
      passwordHash,
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    });
    console.log('Created Admin User:    admin@pii-platform.local');
  } else {
    admin.passwordHash = passwordHash;
    admin.status = 'ACTIVE';
    await admin.save();
    console.log('Updated Admin User:    admin@pii-platform.local');
  }

  let reviewer = await User.findOne({ normalizedEmail: 'reviewer@pii-platform.local' });
  if (!reviewer) {
    reviewer = await User.create({
      email: 'reviewer@pii-platform.local',
      normalizedEmail: 'reviewer@pii-platform.local',
      passwordHash: reviewerPasswordHash,
      role: 'REVIEWER',
      status: 'ACTIVE',
      emailVerified: true,
    });
    console.log('Created Reviewer User: reviewer@pii-platform.local');
  } else {
    reviewer.passwordHash = reviewerPasswordHash;
    reviewer.status = 'ACTIVE';
    await reviewer.save();
    console.log('Updated Reviewer User: reviewer@pii-platform.local');
  }

  // 2. Organization
  let org = await Organization.findOne({ normalizedName: 'acme health & privacy corp' });
  if (!org) {
    org = await Organization.create({
      name: 'Acme Health & Privacy Corp',
      normalizedName: 'acme health & privacy corp',
      createdBy: admin._id,
      status: 'ACTIVE',
    });
    console.log(`Created Organization:  Acme Health & Privacy Corp (ID: ${org._id.toString()})`);
  } else {
    console.log(`Found Organization:    Acme Health & Privacy Corp (ID: ${org._id.toString()})`);
  }

  // 3. Organization Memberships
  await OrganizationMembership.findOneAndUpdate(
    { userId: admin._id, organizationId: org._id },
    { tenantRole: 'ORG_ADMIN', status: 'ACTIVE' },
    { upsert: true }
  );
  await OrganizationMembership.findOneAndUpdate(
    { userId: reviewer._id, organizationId: org._id },
    { tenantRole: 'REVIEWER', status: 'ACTIVE' },
    { upsert: true }
  );

  // 4. Comprehensive Privacy Policy (HIPAA & GDPR)
  const comprehensiveRules = [
    {
      ruleId: 'rule_ssn_redact',
      name: 'US SSN Redaction Rule',
      priority: 10,
      action: 'REDACT',
      rationaleCode: 'HIPAA_DIRECT_IDENTIFIER_SSN',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'US_SSN' }],
    },
    {
      ruleId: 'rule_cc_redact',
      name: 'Payment Card Redaction Rule',
      priority: 9,
      action: 'REDACT',
      rationaleCode: 'PCI_CARDHOLDER_DATA',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'CREDIT_CARD_NUMBER' }],
    },
    {
      ruleId: 'rule_email_redact',
      name: 'Email Address Redaction Rule',
      priority: 8,
      action: 'REDACT',
      rationaleCode: 'HIPAA_DIRECT_IDENTIFIER_EMAIL',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'EMAIL_ADDRESS' }],
    },
    {
      ruleId: 'rule_name_redact',
      name: 'Patient & Clinician Name Redaction Rule',
      priority: 7,
      action: 'REDACT',
      rationaleCode: 'HIPAA_DIRECT_IDENTIFIER_NAME',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'PERSON_NAME' }],
    },
    {
      ruleId: 'rule_phone_redact',
      name: 'Contact Phone Redaction Rule',
      priority: 6,
      action: 'REDACT',
      rationaleCode: 'HIPAA_DIRECT_IDENTIFIER_PHONE',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'PHONE_NUMBER' }],
    },
    {
      ruleId: 'rule_address_redact',
      name: 'Postal Address Redaction Rule',
      priority: 5,
      action: 'REDACT',
      rationaleCode: 'HIPAA_GEOGRAPHIC_IDENTIFIER',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'POSTAL_ADDRESS' }],
    },
    {
      ruleId: 'rule_dob_redact',
      name: 'Date of Birth Redaction Rule',
      priority: 4,
      action: 'REDACT',
      rationaleCode: 'HIPAA_TEMPORAL_IDENTIFIER',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'DATE_OF_BIRTH' }],
    },
    {
      ruleId: 'rule_pan_redact',
      name: 'Indian PAN Redaction Rule',
      priority: 3,
      action: 'REDACT',
      rationaleCode: 'GOVERNMENT_IDENTIFIER_PAN',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'INDIAN_PAN' }],
    },
    {
      ruleId: 'rule_aadhaar_redact',
      name: 'Indian Aadhaar Redaction Rule',
      priority: 3,
      action: 'REDACT',
      rationaleCode: 'GOVERNMENT_IDENTIFIER_AADHAAR',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'INDIAN_AADHAAR' }],
    },
    {
      ruleId: 'rule_auth_redact',
      name: 'Auth Security Key Redaction Rule',
      priority: 3,
      action: 'REDACT',
      rationaleCode: 'SECURITY_CREDENTIAL',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'AUTH_TOKEN_KEY' }],
    },
    {
      ruleId: 'rule_unknown_pii_redact',
      name: 'Reference & Identifier Redaction Rule',
      priority: 2,
      action: 'REDACT',
      rationaleCode: 'DIRECT_IDENTIFIER_REFERENCE',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'UNKNOWN_PII' }],
    },
  ];

  const configHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(comprehensiveRules) + 'KEEP')
    .digest('hex');

  let policy = await PolicyModel.findOne({ organizationId: org._id });
  if (!policy) {
    policy = await PolicyModel.create({
      policyId: `pol_${crypto.randomUUID()}`,
      organizationId: org._id,
      name: 'HIPAA & GDPR Privacy Standard',
      description: 'Comprehensive automated de-identification rule baseline for clinical and consumer records.',
      version: 1,
      status: 'PUBLISHED',
      defaultDecision: 'KEEP',
      rules: comprehensiveRules as any,
      configurationHash: configHash,
      createdBy: admin._id,
    });
    console.log(`Created Policy:        HIPAA & GDPR Privacy Standard (${comprehensiveRules.length} rules)`);
  } else {
    policy.rules = comprehensiveRules as any;
    policy.configurationHash = configHash;
    policy.status = 'PUBLISHED';
    await policy.save();
    console.log(`Updated Policy:        HIPAA & GDPR Privacy Standard (${comprehensiveRules.length} rules)`);
  }

  // 5. Setup Storage Directories
  const orgDocsDir = path.resolve(process.cwd(), 'storage', 'orgs', org._id.toString(), 'docs');
  await fs.promises.mkdir(orgDocsDir, { recursive: true });

  // 6. Define 5 Diverse Mock Documents
  interface MockDocDef {
    filename: string;
    mimeType: string;
    extension: string;
    content: string | Buffer;
  }

  // Load sample PDF if available
  let pdfBuffer: Buffer;
  const backupPdfPath = path.resolve(process.cwd(), 'sample_docs', 'sample_synthetic_medical_report_pii.pdf');
  const existingPdfPath = path.resolve(process.cwd(), 'storage', 'orgs', org._id.toString(), 'docs', 'a55de92e-f8d5-4832-b48d-ce4694a27d98.pdf');

  if (fs.existsSync(backupPdfPath)) {
    pdfBuffer = fs.readFileSync(backupPdfPath);
  } else if (fs.existsSync(existingPdfPath)) {
    pdfBuffer = fs.readFileSync(existingPdfPath);
  } else {
    pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  }

  const mockDocs: MockDocDef[] = [
    {
      filename: 'sample_synthetic_medical_report_pii.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      content: pdfBuffer,
    },
    {
      filename: 'patient_discharge_summary_sample.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      content: `=======================================================
PATIENT DISCHARGE SUMMARY & CLINICAL RECORD
Date: October 14, 2026
Facility: St. Jude Metropolitan Healthcare
=======================================================

Patient Full Name: Jane Elizabeth Doe
Date of Birth: 1984-07-22
Social Security Number: 000-12-3456
Phone Contact: +1-555-019-2834
Email Address: jane.doe.patient@example.invalid
Address: 742 Evergreen Terrace, Springfield, OR 97477

PRIMARY DIAGNOSIS:
Acute respiratory viral syndrome, resolved.

TREATMENT & PRESCRIPTION:
Amoxicillin 500mg tid x 7 days.
Billing Reference Card: 4111-1111-1111-1234
Primary Attending Physician: Dr. Robert Vance, MD

DISCHARGE INSTRUCTIONS:
Follow up in outpatient clinic in 14 days. Call 911 for emergency.
=======================================================`,
    },
    {
      filename: 'employee_payroll_roster_sample.csv',
      mimeType: 'text/csv',
      extension: 'csv',
      content: `EmployeeID,FullName,Department,WorkEmail,ContactPhone,NationalID,CorporateCard,HomeAddress
EMP-1042,Marcus Vance,Engineering,marcus.vance@example.com,+1-555-432-8765,000-45-6789,4111-1111-1111-4321,1204 Pine Valley Way, Seattle, WA 98101
EMP-1043,Elena Rostova,Finance,elena.rostova@example.com,+1-555-876-2345,000-89-1234,4111-1111-1111-8765,450 Beacon Street, Boston, MA 02115
EMP-1044,Devin Chen,Legal & Compliance,devin.chen@example.com,+1-555-901-3456,000-12-7890,4111-1111-1111-9988,88 Market Street, San Francisco, CA 94105
EMP-1045,Amara Okafor,Clinical Operations,amara.okafor@example.com,+1-555-321-9876,000-67-4321,4111-1111-1111-1122,305 Peachtree St, Atlanta, GA 30308`,
    },
    {
      filename: 'customer_kyc_application_sample.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      content: `=======================================================
RETAIL BANKING KYC & ONBOARDING VERIFICATION
Application Ref: KYC-IND-2026-9812
Date Submitted: 14 October 2026
=======================================================

APPLICANT PROFILE:
Applicant Full Name: Ananya Sharma
Father / Spouse Name: Vikram Sharma
Date of Birth: 1993-04-18
Gender: Female

GOVERNMENT IDENTIFICATION:
Permanent Account Number (PAN): ABCDE1234F
Aadhaar Number: 3456 7890 1234
Passport Reference Number: Z9876543

CONTACT & RESIDENTIAL DETAILS:
Mobile Number: +91 98765 43210
Personal Email: ananya.sharma@example.test
Current Residential Address: 12 Lake View Road, Indiranagar, Bangalore, Karnataka 560038

DECLARATION:
I confirm the personal and financial details provided above are authentic.
Signature on File: Ananya Sharma
=======================================================`,
    },
    {
      filename: 'cloud_infrastructure_audit_sample.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      content: `2026-10-14T02:14:01.120Z [INFO] System audit started by engineer: David K. Miller
2026-10-14T02:14:02.341Z [AUTH] API Key authentication accepted: bearer=sec_live_98a7fbc20419d8e723ab9102c4
2026-10-14T02:14:03.490Z [IAM] AWS Access session started: key=AKIAIOSFODNN7EXAMPLE
2026-10-14T02:14:04.601Z [AUDIT] Contact notification sent to administrator: devops-alerts@example.com
2026-10-14T02:14:05.112Z [NETWORK] Ingress connection verified from workstation: 192.168.1.105
2026-10-14T02:14:06.904Z [SECURITY] Emergency on-call contact: +1-555-789-0123
2026-10-14T02:14:07.015Z [SUCCESS] Session closed for operator: David K. Miller`,
    },
  ];

  console.log('\n--- Ingesting & Running Pipelines for Demo Documents ---\n');

  for (const mock of mockDocs) {
    const rawBuffer = Buffer.isBuffer(mock.content) ? mock.content : Buffer.from(mock.content, 'utf-8');
    const checksum = crypto.createHash('sha256').update(rawBuffer).digest('hex');

    const storageKey = `orgs/${org._id.toString()}/docs/${mock.filename}`;
    const storageDestPath = path.resolve(process.cwd(), 'storage', storageKey);
    await fs.promises.mkdir(path.dirname(storageDestPath), { recursive: true });
    await fs.promises.writeFile(storageDestPath, rawBuffer);

    let doc = await DocumentModel.findOne({ originalFilename: mock.filename, organizationId: org._id });
    if (!doc) {
      doc = await DocumentModel.create({
        organizationId: org._id,
        uploadedBy: admin._id,
        originalFilename: mock.filename,
        size: rawBuffer.length,
        declaredMimeType: mock.mimeType,
        detectedMimeType: mock.mimeType,
        extension: mock.extension,
        storageKey,
        status: 'READY',
        checksum,
        isDeleted: false,
      });
      console.log(`[INGESTED] ${mock.filename} (ID: ${doc._id.toString()})`);
    } else {
      doc.storageKey = storageKey;
      doc.size = rawBuffer.length;
      doc.checksum = checksum;
      doc.status = 'READY';
      await doc.save();
      console.log(`[UPDATED]  ${mock.filename} (ID: ${doc._id.toString()})`);
    }

    try {
      // 1. Text/Content Extraction
      process.stdout.write(`  -> Extracting content... `);
      await extractionService.processDocumentExtraction(doc._id.toString(), org._id.toString());
      process.stdout.write(`done.\n`);

      // 2. PII Candidate Detection
      process.stdout.write(`  -> Detecting PII candidates... `);
      const piiResult = await piiDetectionService.detectPIIForDocument(doc._id.toString(), org._id.toString(), { force: true });
      process.stdout.write(`found ${piiResult.candidates.length} candidates.\n`);

      // 3. Context Analysis
      process.stdout.write(`  -> Analyzing context & relationships... `);
      await contextAnalysisService.runContextAnalysis(doc._id.toString(), org._id.toString(), { force: true });
      process.stdout.write(`done.\n`);

      // 4. Policy Decision Evaluation
      process.stdout.write(`  -> Evaluating policy decisions... `);
      const decResult = await policyService.evaluateDocumentDecisions(doc._id.toString(), org._id.toString(), { force: true });
      const redactCount = decResult.results.filter(r => r.decision === 'REDACT').length;
      const reviewCount = decResult.results.filter(r => r.decision === 'REVIEW').length;
      const keepCount = decResult.results.filter(r => r.decision === 'KEEP').length;
      process.stdout.write(`evaluated (${redactCount} REDACT, ${reviewCount} REVIEW, ${keepCount} KEEP).\n`);

      // 5. Physical Redaction Transformation
      process.stdout.write(`  -> Performing physical redaction... `);
      const transResult = await transformationService.executeTransformation(doc._id.toString(), org._id.toString(), { force: true, operation: 'REDACTION' });
      process.stdout.write(`redacted ${transResult.run.redactedCount} items (Artifact: ${transResult.artifact.outputArtifactId}).\n`);

      // 6. Re-Identification Risk Assessment
      process.stdout.write(`  -> Calculating re-identification risk... `);
      const riskResult = await riskService.executeRiskAnalysis(doc._id.toString(), org._id.toString(), { force: true });
      process.stdout.write(`tier: ${riskResult.run?.riskLevel} (score: ${riskResult.run?.reidentificationRiskScore}).\n`);

      // 7. Independent Verification QA
      process.stdout.write(`  -> Running verification QA checks... `);
      const verResult = await verificationService.executeVerification(doc._id.toString(), org._id.toString(), { force: true });
      process.stdout.write(`status: ${verResult.run?.overallStatus} (checks: ${verResult.results?.length}).\n\n`);

    } catch (procErr: unknown) {
      console.error(`\n  [WARNING] Pipeline processing error on ${mock.filename}:`, (procErr as Error).message);
    }
  }

  console.log('\n--- Seeding Human Review Cases & Authoritative Adjudications ---\n');

  const pdfDoc = await DocumentModel.findOne({ originalFilename: 'sample_synthetic_medical_report_pii.pdf', organizationId: org._id });
  const txtDoc = await DocumentModel.findOne({ originalFilename: 'patient_discharge_summary_sample.txt', organizationId: org._id });
  const csvDoc = await DocumentModel.findOne({ originalFilename: 'employee_payroll_roster_sample.csv', organizationId: org._id });
  const kycDoc = await DocumentModel.findOne({ originalFilename: 'customer_kyc_application_sample.txt', organizationId: org._id });
  const cldDoc = await DocumentModel.findOne({ originalFilename: 'cloud_infrastructure_audit_sample.txt', organizationId: org._id });

  const fallbackDocId = (pdfDoc || txtDoc || csvDoc || kycDoc || cldDoc)?._id;

  const reviewCaseDefs: any[] = [
    {
      reviewCaseId: 'case_rev_ambiguous_name_01',
      documentId: pdfDoc ? pdfDoc._id : fallbackDocId,
      caseType: 'AMBIGUOUS_POLICY',
      priority: 'HIGH',
      severity: 'HIGH',
      status: 'OPEN',
      caseVersion: 1,
      assignmentVersion: 1,
      reasonCodes: ['CONFIDENCE_MARGIN_LOW', 'POTENTIAL_CLINICIAN_NAME'],
      safeEvidenceReferences: [
        {
          candidateId: 'cand_med_01',
          piiType: 'PERSON_NAME',
          locationLabel: 'Page 1, Paragraph 2: "Dr. Robert Vance, MD"',
          expectedAction: 'REDACT',
          observedState: 'Heuristic NER detected title clinician without explicit suffix list match',
        },
      ],
      reviewDeadline: new Date(Date.now() + 48 * 3600 * 1000),
    },
    {
      reviewCaseId: 'case_rev_risk_discharge_02',
      documentId: txtDoc ? txtDoc._id : fallbackDocId,
      caseType: 'HIGH_RISK_REVIEW',
      priority: 'URGENT',
      severity: 'CRITICAL',
      status: 'ASSIGNED',
      assignedReviewerId: reviewer._id,
      assignmentVersion: 1,
      leaseOwnerId: reviewer._id,
      leaseExpiresAt: new Date(Date.now() + 14 * 60 * 1000),
      caseVersion: 1,
      reasonCodes: ['HIGH_REIDENTIFICATION_SCORE', 'MULTIPLE_QUASI_IDENTIFIERS'],
      safeEvidenceReferences: [
        {
          candidateId: 'cand_disch_02',
          piiType: 'DATE_OF_BIRTH',
          locationLabel: 'Line 8: "1984-07-22"',
          expectedAction: 'REDACT',
          observedState: 'Quasi-identifier linked with zip code 97477 creates k-anonymity risk',
        },
      ],
      reviewDeadline: new Date(Date.now() + 24 * 3600 * 1000),
    },
    {
      reviewCaseId: 'case_rev_kyc_verification_03',
      documentId: kycDoc ? kycDoc._id : fallbackDocId,
      caseType: 'PARTIAL_VERIFICATION',
      priority: 'MEDIUM',
      severity: 'MEDIUM',
      status: 'RESOLVED',
      assignedReviewerId: reviewer._id,
      assignmentVersion: 1,
      caseVersion: 2,
      resolvedAt: new Date(Date.now() - 3600 * 1000),
      reasonCodes: ['GOVERNMENT_ID_VERIFIED'],
      safeEvidenceReferences: [
        {
          candidateId: 'cand_kyc_03',
          piiType: 'INDIAN_PAN',
          locationLabel: 'Government ID: "ABCDE1234F"',
          expectedAction: 'REDACT',
          observedState: 'Valid format checksum matched, redacted with [REDACTED_INDIAN_PAN]',
        },
      ],
      decision: {
        reviewDecisionId: 'rev_dec_kyc_03',
        reviewerId: reviewer._id,
        decisionType: 'CONFIRM_REDACTION',
        decisionSequence: 1,
        isSecondReview: false,
        reasonCode: 'VERIFIED_SYNTHETIC_DATA',
        safeRationale: 'Confirmed Indian PAN pattern and verified complete redaction in physical artifact. Safe for release.',
        expectedNextAction: 'RESOLVE_CASE',
        caseVersion: 1,
      },
    },
    {
      reviewCaseId: 'case_rev_payroll_override_04',
      documentId: csvDoc ? csvDoc._id : fallbackDocId,
      caseType: 'CONFLICTING_EVIDENCE',
      priority: 'LOW',
      severity: 'MEDIUM',
      status: 'RESOLVED',
      assignedReviewerId: admin._id,
      assignmentVersion: 1,
      caseVersion: 2,
      resolvedAt: new Date(Date.now() - 7200 * 1000),
      reasonCodes: ['INTERNAL_DEPARTMENT_ROSTER'],
      safeEvidenceReferences: [
        {
          candidateId: 'cand_pay_04',
          piiType: 'US_SSN',
          locationLabel: 'Row 2: "000-45-6789"',
          expectedAction: 'REDACT',
          observedState: 'Deterministic SSN masking applied',
        },
      ],
      decision: {
        reviewDecisionId: 'rev_dec_pay_04',
        reviewerId: admin._id,
        decisionType: 'CONFIRM_FINDING',
        decisionSequence: 1,
        isSecondReview: false,
        reasonCode: 'PCI_HIPAA_COMPLIANCE_APPROVED',
        safeRationale: 'All employee National IDs and corporate card digits verified correctly masked.',
        expectedNextAction: 'RESOLVE_CASE',
        caseVersion: 1,
      },
    },
    {
      reviewCaseId: 'case_rev_cloud_audit_05',
      documentId: cldDoc ? cldDoc._id : fallbackDocId,
      caseType: 'CAPABILITY_UNAVAILABLE',
      priority: 'HIGH',
      severity: 'HIGH',
      status: 'OPEN',
      caseVersion: 1,
      assignmentVersion: 1,
      reasonCodes: ['SECURITY_CREDENTIAL_SUSPECT', 'SECRET_KEY_ENTROPY'],
      safeEvidenceReferences: [
        {
          candidateId: 'cand_cld_05',
          piiType: 'AUTH_TOKEN_KEY',
          locationLabel: 'Line 2: "sec_live_98a7fbc20419d8e723ab9102c4"',
          expectedAction: 'REDACT',
          observedState: 'Live token pattern detected in developer debug logging',
        },
      ],
      reviewDeadline: new Date(Date.now() + 12 * 3600 * 1000),
    },
  ];

  for (const cDef of reviewCaseDefs) {
    const { decision, ...caseData } = cDef;
    await HumanReviewCaseModel.findOneAndUpdate(
      { reviewCaseId: caseData.reviewCaseId, organizationId: org._id },
      { ...caseData, organizationId: org._id, createdByUserId: admin._id },
      { upsert: true, new: true }
    );
    console.log(`[REVIEW CASE] ${caseData.reviewCaseId} [${caseData.status} | Priority: ${caseData.priority}]`);

    if (decision) {
      await ReviewDecisionModel.findOneAndUpdate(
        { reviewDecisionId: decision.reviewDecisionId, organizationId: org._id },
        { ...decision, organizationId: org._id, reviewCaseId: caseData.reviewCaseId },
        { upsert: true, new: true }
      );
      console.log(`  -> Attached Decision: ${decision.decisionType} (${decision.reasonCode})`);
    }
  }

  console.log('================================================================');
  console.log('                   DEMO DATA SEEDING COMPLETE                   ');
  console.log('================================================================');
  console.log('You can now log in to the web platform to demonstrate:');
  console.log('  URL:           http://localhost:5175');
  console.log('  Admin Login:   admin@pii-platform.local / AdminPass123!');
  console.log('  Reviewer:      reviewer@pii-platform.local / ReviewerPass123!');
  console.log('  Tenant Org:    Acme Health & Privacy Corp (' + org._id.toString() + ')');
  console.log('================================================================\n');

  await disconnectDatabase();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
