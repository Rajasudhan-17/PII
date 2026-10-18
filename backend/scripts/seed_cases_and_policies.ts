import crypto from 'crypto';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { User } from '../src/models/user.model';
import { Organization } from '../src/models/organization.model';
import { PolicyModel } from '../src/models/policy.model';
import { DocumentModel } from '../src/models/document.model';
import { HumanReviewCaseModel } from '../src/models/humanReviewCase.model';
import { ReviewDecisionModel } from '../src/models/reviewDecision.model';

async function seedCasesAndPolicies() {
  console.log('Connecting to MongoDB...');
  await connectDatabase();

  const admin = await User.findOne({ normalizedEmail: 'admin@pii-platform.local' });
  const reviewer = await User.findOne({ normalizedEmail: 'reviewer@pii-platform.local' });
  const org = await Organization.findOne({
    normalizedName: { $in: ['acme health & privacy corp', 'acme health corp'] },
  });

  if (!org || !admin || !reviewer) {
    console.error('Missing prerequisite org or users. Org:', !!org, 'Admin:', !!admin, 'Reviewer:', !!reviewer);
    process.exit(1);
  }

  console.log(`Using Org: ${org.name} (${org._id.toString()})`);

  // 1. Seed Policies
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
    console.log(`[POLICY] ${p.policyId}: "${p.name}" (v${p.version})`);
  }

  // 2. Lookup Documents
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

  // 3. Seed Human Review Cases
  const reviewCaseDefs: any[] = [
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
          observedState: 'Heuristic NER detected clinician without suffix match',
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
          observedState: 'Quasi-identifier linked with zip code 97477 creates risk',
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
          observedState: 'Valid format checksum matched',
        },
      ],
      decision: {
        reviewDecisionId: 'rev_dec_kyc_03',
        reviewerId: reviewer._id,
        decisionType: 'CONFIRM_REDACTION',
        decisionSequence: 1,
        isSecondReview: false,
        reasonCode: 'VERIFIED_SYNTHETIC_DATA',
        safeRationale: 'Confirmed Indian PAN pattern and verified complete redaction in physical artifact.',
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
      console.log(`  -> Attached Decision: ${decision.decisionType}`);
    }
  }

  console.log('Seeding completed successfully!');
  await disconnectDatabase();
}

seedCasesAndPolicies().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});
