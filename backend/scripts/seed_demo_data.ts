import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { User } from '../src/models/user.model';
import { Organization } from '../src/models/organization.model';
import { OrganizationMembership } from '../src/models/membership.model';
import { PolicyModel } from '../src/models/policy.model';
import { DocumentModel } from '../src/models/document.model';
import { NormalizedDocumentModel } from '../src/models/normalizedDocument.model';
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

function createBankStatementXlsx(): Buffer {
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['Transaction Date', 'Description', 'Account Number', 'SSN / Tax ID', 'Amount', 'Balance'],
    ['2026-07-01', 'Direct Deposit Payroll - Acme Corp', 'ACCT-98214-5541', '000-12-3456', 4500.0, 12450.0],
    ['2026-07-05', 'Payment to Jane Elizabeth Doe', 'ACCT-11029-3382', '000-45-6789', -350.0, 12100.0],
    ['2026-07-12', 'Wire Transfer - Dr. Robert Vance', 'ACCT-44910-8821', '000-89-1234', -1200.0, 10900.0],
    ['2026-07-18', 'AutoPay Credit Card 4111-1111-1111-4321', 'ACCT-98214-5541', '000-12-3456', -425.8, 10474.2],
    ['2026-07-25', 'Consulting Fee - Elena Rostova', 'ACCT-66721-0092', '000-67-4321', 1850.0, 12324.2],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Q3 Statement');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function createVendorContractDocx(): Buffer {
  const zip = new AdmZip();
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>MASTER SERVICES AGREEMENT</w:t></w:r></w:p>
    <w:p><w:r><w:t>This Agreement is executed between Acme Health Corp and Global Logistics Systems Inc.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Primary Representative: Sarah Jenkins (Email: s.jenkins@globallogistics.example.com, Phone: +1-555-839-2041)</w:t></w:r></w:p>
    <w:p><w:r><w:t>Signer Tax Identification SSN: 000-55-1298</w:t></w:r></w:p>
    <w:p><w:r><w:t>Designated Card for Retainer Billing: 4111-1111-1111-9876</w:t></w:r></w:p>
    <w:p><w:r><w:t>Corporate Office: 500 Technology Square, Suite 400, Cambridge, MA 02139</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  zip.addFile('[Content_Types].xml', Buffer.from(contentTypesXml, 'utf8'));
  zip.addFile('_rels/.rels', Buffer.from(relsXml, 'utf8'));
  zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf8'));
  return zip.toBuffer();
}

function createSamplePng(): Buffer {
  // Valid 1x1 transparent PNG buffer
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
}

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
  let org = await Organization.findOne({
    normalizedName: { $in: ['acme health & privacy corp', 'acme health corp'] },
  });
  if (!org) {
    org = await Organization.create({
      name: 'Acme Health & Privacy Corp',
      normalizedName: 'acme health & privacy corp',
      createdBy: admin._id,
      status: 'ACTIVE',
    });
    console.log(`Created Organization:  Acme Health & Privacy Corp (ID: ${org._id.toString()})`);
  } else {
    console.log(`Found Organization:    ${org.name} (ID: ${org._id.toString()})`);
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

  // 4. Privacy Policies (Aligned with capture_mock: p1, p2, p3, plus comprehensive standard)
  const standardRules = [
    {
      ruleId: 'r1',
      name: 'Redact government IDs',
      priority: 1,
      action: 'REDACT',
      conditions: [{ property: 'type', operator: 'IN', value: ['US_SSN', 'INDIAN_AADHAAR', 'INDIAN_PAN'] }],
      rationaleCode: 'GOV_ID',
    },
    {
      ruleId: 'r2',
      name: 'Redact payment cards',
      priority: 2,
      action: 'REDACT',
      conditions: [{ property: 'type', operator: 'EQUALS', value: 'CREDIT_CARD_NUMBER' }],
      rationaleCode: 'PCI',
    },
    {
      ruleId: 'r3',
      name: 'Review low-confidence names',
      priority: 5,
      action: 'REVIEW',
      conditions: [{ property: 'detectionScore', operator: 'LESS_THAN', value: 0.7 }],
      rationaleCode: 'LOW_CONF',
    },
  ];

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

  const policiesToSeed = [
    {
      policyId: 'p1',
      name: 'HIPAA Baseline',
      description: 'Healthcare PHI de-identification',
      version: 2,
      status: 'PUBLISHED' as const,
      defaultDecision: 'REVIEW' as const,
      rules: standardRules,
    },
    {
      policyId: 'p2',
      name: 'GDPR Standard',
      description: 'EU personal data minimisation',
      version: 2,
      status: 'PUBLISHED' as const,
      defaultDecision: 'REVIEW' as const,
      rules: standardRules,
    },
    {
      policyId: 'p3',
      name: 'PCI-DSS Cardholder',
      description: 'Payment card data protection',
      version: 2,
      status: 'PUBLISHED' as const,
      defaultDecision: 'REVIEW' as const,
      rules: standardRules,
    },
    {
      policyId: 'pol_comprehensive_01',
      name: 'HIPAA & GDPR Privacy Standard',
      description: 'Comprehensive automated de-identification rule baseline for clinical and consumer records.',
      version: 1,
      status: 'PUBLISHED' as const,
      defaultDecision: 'KEEP' as const,
      rules: comprehensiveRules,
    },
  ];

  console.log('\n--- Seeding Privacy Policies ---');
  for (const p of policiesToSeed) {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(p.rules) + p.defaultDecision)
      .digest('hex');

    await PolicyModel.findOneAndUpdate(
      { policyId: p.policyId, organizationId: org._id },
      {
        policyId: p.policyId,
        organizationId: org._id,
        name: p.name,
        description: p.description,
        version: p.version,
        status: p.status,
        defaultDecision: p.defaultDecision,
        rules: p.rules as any,
        configurationHash: hash,
        createdBy: admin._id,
      },
      { upsert: true, new: true }
    );
    console.log(`[POLICY] ${p.policyId}: "${p.name}" (v${p.version}) [${p.status}]`);
  }

  // 5. Setup Storage Directories
  const orgDocsDir = path.resolve(process.cwd(), 'storage', 'orgs', org._id.toString(), 'docs');
  await fs.promises.mkdir(orgDocsDir, { recursive: true });

  // 6. Define Mock Documents (6 capture_mock docs + comprehensive demo documents)
  interface MockDocDef {
    filename: string;
    mimeType: string;
    extension: string;
    content: string | Buffer;
    isOcrImage?: boolean;
    desiredFinalStatus?: string;
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
    // 1. clinical_discharge_summary.pdf (capture_mock doc 1)
    {
      filename: 'clinical_discharge_summary.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      content: pdfBuffer,
      desiredFinalStatus: 'COMPLETED',
    },
    // 2. bank_statement_q3.xlsx (capture_mock doc 2)
    {
      filename: 'bank_statement_q3.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
      content: createBankStatementXlsx(),
      desiredFinalStatus: 'COMPLETED',
    },
    // 3. hr_employee_records.csv (capture_mock doc 3)
    {
      filename: 'hr_employee_records.csv',
      mimeType: 'text/csv',
      extension: 'csv',
      content: `EmployeeID,FullName,Department,WorkEmail,ContactPhone,NationalID,CorporateCard,HomeAddress
EMP-1042,Marcus Vance,Engineering,marcus.vance@example.com,+1-555-432-8765,000-45-6789,4111-1111-1111-4321,1204 Pine Valley Way, Seattle, WA 98101
EMP-1043,Elena Rostova,Finance,elena.rostova@example.com,+1-555-876-2345,000-89-1234,4111-1111-1111-8765,450 Beacon Street, Boston, MA 02115
EMP-1044,Devin Chen,Legal & Compliance,devin.chen@example.com,+1-555-901-3456,000-12-7890,4111-1111-1111-9988,88 Market Street, San Francisco, CA 94105
EMP-1045,Amara Okafor,Clinical Operations,amara.okafor@example.com,+1-555-321-9876,000-67-4321,4111-1111-1111-1122,305 Peachtree St, Atlanta, GA 30308`,
      desiredFinalStatus: 'EXTRACTED',
    },
    // 4. cloud_audit_log.txt (capture_mock doc 4)
    {
      filename: 'cloud_audit_log.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      content: `2026-10-14T02:14:01.120Z [INFO] System audit started by engineer: David K. Miller
2026-10-14T02:14:02.341Z [AUTH] API Key authentication accepted: bearer=sec_live_98a7fbc20419d8e723ab9102c4
2026-10-14T02:14:03.490Z [IAM] AWS Access session started: key=AKIAIOSFODNN7EXAMPLE
2026-10-14T02:14:04.601Z [AUDIT] Contact notification sent to administrator: devops-alerts@example.com
2026-10-14T02:14:05.112Z [NETWORK] Ingress connection verified from workstation: 192.168.1.105
2026-10-14T02:14:06.904Z [SECURITY] Emergency on-call contact: +1-555-789-0123
2026-10-14T02:14:07.015Z [SUCCESS] Session closed for operator: David K. Miller`,
      desiredFinalStatus: 'COMPLETED',
    },
    // 5. scanned_kyc_form.png (capture_mock doc 5)
    {
      filename: 'scanned_kyc_form.png',
      mimeType: 'image/png',
      extension: 'png',
      content: createSamplePng(),
      isOcrImage: true,
      desiredFinalStatus: 'OCR_COMPLETED',
    },
    // 6. vendor_contract.docx (capture_mock doc 6)
    {
      filename: 'vendor_contract.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
      content: createVendorContractDocx(),
      desiredFinalStatus: 'EXTRACTED',
    },
    // Additional rich documents
    {
      filename: 'sample_synthetic_medical_report_pii.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      content: pdfBuffer,
      desiredFinalStatus: 'COMPLETED',
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
      desiredFinalStatus: 'COMPLETED',
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
      desiredFinalStatus: 'COMPLETED',
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
      desiredFinalStatus: 'COMPLETED',
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
      desiredFinalStatus: 'COMPLETED',
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

    let doc = await DocumentModel.findOne({ storageKey });
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

      // If this is an OCR image document, populate realistic normalized OCR blocks for PII scanning
      if (mock.isOcrImage) {
        process.stdout.write(`  -> Synthesizing OCR blocks for KYC image... `);
        const kycBlocks = [
          {
            blockId: `blk_${crypto.randomUUID()}`,
            type: 'HEADING',
            pageNumber: 1,
            readingOrder: 1,
            text: 'RETAIL BANKING KYC & ONBOARDING FORM',
            words: [],
            confidence: 0.98,
          },
          {
            blockId: `blk_${crypto.randomUUID()}`,
            type: 'PARAGRAPH',
            pageNumber: 1,
            readingOrder: 2,
            text: 'Applicant Name: Ananya Sharma | DOB: 1993-04-18',
            words: [],
            confidence: 0.95,
          },
          {
            blockId: `blk_${crypto.randomUUID()}`,
            type: 'PARAGRAPH',
            pageNumber: 1,
            readingOrder: 3,
            text: 'Permanent Account Number (PAN): ABCDE1234F | Aadhaar: 3456 7890 1234',
            words: [],
            confidence: 0.99,
          },
          {
            blockId: `blk_${crypto.randomUUID()}`,
            type: 'PARAGRAPH',
            pageNumber: 1,
            readingOrder: 4,
            text: 'Mobile Contact: +91 98765 43210 | Email: ananya.sharma@example.test',
            words: [],
            confidence: 0.97,
          },
        ];

        await NormalizedDocumentModel.findOneAndUpdate(
          { organizationId: org._id, documentId: doc._id },
          {
            status: 'OCR_COMPLETED',
            format: 'PNG',
            blocks: kycBlocks as any,
            extractedAt: new Date(),
          },
          { upsert: true }
        );
        doc.status = 'OCR_COMPLETED';
        await doc.save();
        process.stdout.write(`done.\n`);
      }

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
      const redactCount = decResult.results.filter((r) => r.decision === 'REDACT').length;
      const reviewCount = decResult.results.filter((r) => r.decision === 'REVIEW').length;
      const keepCount = decResult.results.filter((r) => r.decision === 'KEEP').length;
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
      process.stdout.write(`status: ${verResult.run?.overallStatus} (checks: ${verResult.results?.length}).\n`);

      // Set final status
      if (mock.desiredFinalStatus) {
        doc.status = mock.desiredFinalStatus as any;
        await doc.save();
        process.stdout.write(`  -> Final status set: ${doc.status}\n\n`);
      } else {
        process.stdout.write(`\n`);
      }
    } catch (procErr: unknown) {
      console.error(`\n  [WARNING] Pipeline processing error on ${mock.filename}:`, (procErr as Error).message);
    }
  }

  console.log('\n--- Seeding Human Review Cases & Authoritative Adjudications ---\n');

  const clinDoc = await DocumentModel.findOne({ originalFilename: 'clinical_discharge_summary.pdf', organizationId: org._id });
  const bankDoc = await DocumentModel.findOne({ originalFilename: 'bank_statement_q3.xlsx', organizationId: org._id });
  const hrDoc = await DocumentModel.findOne({ originalFilename: 'hr_employee_records.csv', organizationId: org._id });
  const auditDoc = await DocumentModel.findOne({ originalFilename: 'cloud_audit_log.txt', organizationId: org._id });
  const kycImgDoc = await DocumentModel.findOne({ originalFilename: 'scanned_kyc_form.png', organizationId: org._id });
  const vendorDoc = await DocumentModel.findOne({ originalFilename: 'vendor_contract.docx', organizationId: org._id });

  const pdfDoc = await DocumentModel.findOne({ originalFilename: 'sample_synthetic_medical_report_pii.pdf', organizationId: org._id });
  const txtDoc = await DocumentModel.findOne({ originalFilename: 'patient_discharge_summary_sample.txt', organizationId: org._id });
  const csvDoc = await DocumentModel.findOne({ originalFilename: 'employee_payroll_roster_sample.csv', organizationId: org._id });
  const kycDoc = await DocumentModel.findOne({ originalFilename: 'customer_kyc_application_sample.txt', organizationId: org._id });
  const cldDoc = await DocumentModel.findOne({ originalFilename: 'cloud_infrastructure_audit_sample.txt', organizationId: org._id });

  const fallbackDocId = (clinDoc || bankDoc || hrDoc || auditDoc || kycImgDoc || vendorDoc || pdfDoc)?._id;

  const reviewCaseDefs: any[] = [
    // 1. Cases aligned directly with capture_mock.js (rc-1001 to rc-1005)
    {
      reviewCaseId: 'rc-1001',
      documentId: (clinDoc || pdfDoc)?._id || fallbackDocId,
      caseType: 'PARTIAL_VERIFICATION',
      priority: 'HIGH',
      severity: 'HIGH',
      status: 'OPEN',
      caseVersion: 1,
      assignmentVersion: 1,
      reasonCodes: ['PARTIAL_VERIFICATION', 'LOW_CONFIDENCE_NAME'],
      safeEvidenceReferences: [
        {
          candidateId: 'cand_clin_01',
          piiType: 'PERSON_NAME',
          locationLabel: 'Page 1, block 4: "Dr. Robert Vance, MD"',
          expectedAction: 'REDACT',
          observedState: 'AMBIGUOUS',
        },
      ],
      reviewDeadline: new Date(Date.now() + 48 * 3600 * 1000),
    },
    {
      reviewCaseId: 'rc-1002',
      documentId: (bankDoc || csvDoc)?._id || fallbackDocId,
      caseType: 'AMBIGUOUS_POLICY',
      priority: 'MEDIUM',
      severity: 'MEDIUM',
      status: 'IN_REVIEW',
      assignedReviewerId: reviewer._id,
      assignmentVersion: 1,
      leaseOwnerId: reviewer._id,
      leaseExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      caseVersion: 1,
      reasonCodes: ['AMBIGUOUS_POLICY', 'CARDHOLDER_DATA_MATCH'],
      safeEvidenceReferences: [
        {
          candidateId: 'cand_bank_02',
          piiType: 'CREDIT_CARD_NUMBER',
          locationLabel: 'Row 5: "4111-1111-1111-4321"',
          expectedAction: 'REDACT',
          observedState: 'AMBIGUOUS_POLICY',
        },
      ],
      reviewDeadline: new Date(Date.now() + 36 * 3600 * 1000),
    },
    {
      reviewCaseId: 'rc-1003',
      documentId: (hrDoc || txtDoc)?._id || fallbackDocId,
      caseType: 'HIGH_RISK_REVIEW',
      priority: 'CRITICAL',
      severity: 'CRITICAL',
      status: 'OPEN',
      caseVersion: 1,
      assignmentVersion: 1,
      reasonCodes: ['HIGH_RISK_REVIEW', 'DIRECT_IDENTIFIER_CLUSTER'],
      safeEvidenceReferences: [
        {
          candidateId: 'cand_hr_03',
          piiType: 'US_SSN',
          locationLabel: 'Row 2, Col 6: "000-45-6789"',
          expectedAction: 'REDACT',
          observedState: 'HIGH_RISK_DIRECT_IDENTIFIER',
        },
      ],
      reviewDeadline: new Date(Date.now() + 24 * 3600 * 1000),
    },
    {
      reviewCaseId: 'rc-1004',
      documentId: (auditDoc || cldDoc)?._id || fallbackDocId,
      caseType: 'CONFLICTING_EVIDENCE',
      priority: 'LOW',
      severity: 'INFO',
      status: 'RESOLVED',
      assignedReviewerId: admin._id,
      assignmentVersion: 1,
      caseVersion: 2,
      resolvedAt: new Date(Date.now() - 3600 * 1000),
      reasonCodes: ['CONFLICTING_EVIDENCE', 'SECURITY_CREDENTIAL'],
      safeEvidenceReferences: [
        {
          candidateId: 'cand_audit_04',
          piiType: 'AUTH_TOKEN_KEY',
          locationLabel: 'Line 2: "sec_live_98a7fbc20419d8e723ab9102c4"',
          expectedAction: 'REDACT',
          observedState: 'CONFIRMED_API_KEY',
        },
      ],
      decision: {
        reviewDecisionId: 'rev_dec_rc1004',
        reviewerId: admin._id,
        decisionType: 'CONFIRM_FINDING',
        decisionSequence: 1,
        isSecondReview: false,
        reasonCode: 'VERIFIED_CREDENTIAL',
        safeRationale: 'Confirmed API token credential in developer audit log and approved redaction transformation.',
        expectedNextAction: 'RESOLVE_CASE',
        caseVersion: 1,
      },
    },
    {
      reviewCaseId: 'rc-1005',
      documentId: (vendorDoc || kycImgDoc)?._id || fallbackDocId,
      caseType: 'MANUAL_REQUEST',
      priority: 'HIGH',
      severity: 'HIGH',
      status: 'ASSIGNED',
      assignedReviewerId: reviewer._id,
      assignmentVersion: 1,
      leaseOwnerId: reviewer._id,
      leaseExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      caseVersion: 1,
      reasonCodes: ['MANUAL_REQUEST', 'SIGNATORY_REVIEW'],
      safeEvidenceReferences: [
        {
          candidateId: 'cand_vnd_05',
          piiType: 'PERSON_NAME',
          locationLabel: 'Paragraph 3: "Sarah Jenkins"',
          expectedAction: 'REDACT',
          observedState: 'MANUAL_REQUEST',
        },
      ],
      reviewDeadline: new Date(Date.now() + 24 * 3600 * 1000),
    },

    // 2. Comprehensive cases
    {
      reviewCaseId: 'case_rev_ambiguous_name_01',
      documentId: (pdfDoc || clinDoc)?._id || fallbackDocId,
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
      documentId: (txtDoc || clinDoc)?._id || fallbackDocId,
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
      documentId: (kycDoc || kycImgDoc)?._id || fallbackDocId,
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
      documentId: (csvDoc || hrDoc)?._id || fallbackDocId,
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
      documentId: (cldDoc || auditDoc)?._id || fallbackDocId,
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

  console.log('\n================================================================');
  console.log('                   DEMO DATA SEEDING COMPLETE                   ');
  console.log('================================================================');
  console.log('You can now log in to the web platform to demonstrate:');
  console.log('  URL:           http://localhost:5175');
  console.log('  Admin Login:   admin@pii-platform.local / AdminPass123!');
  console.log('  Reviewer:      reviewer@pii-platform.local / ReviewerPass123!');
  console.log(`  Tenant Org:    ${org.name} (${org._id.toString()})`);
  console.log('================================================================\n');

  await disconnectDatabase();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
