const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://root:example@127.0.0.1:27017/pii_platform?authSource=admin');
  const res = await mongoose.connection.collection('policies').updateMany(
    { name: 'HIPAA & GDPR Privacy Standard' },
    {
      $set: {
        rules: [
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
            ruleId: 'rule_national_id_redact',
            name: 'National ID Redaction Rule',
            priority: 3,
            action: 'REDACT',
            rationaleCode: 'GOVERNMENT_IDENTIFIER',
            conditions: [{ property: 'type', operator: 'EQUALS', value: 'NATIONAL_ID' }],
          },
        ]
      }
    }
  );
  console.log('Updated policies count:', res.modifiedCount);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
