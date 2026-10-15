import crypto from 'crypto';

export type ContextSignalType =
  | 'FIELD_LABEL_MATCH'
  | 'SEMANTIC_NEIGHBOR_MATCH'
  | 'SECTION_MATCH'
  | 'TABLE_HEADER_MATCH'
  | 'TABLE_ROW_MATCH'
  | 'DOCUMENT_TYPE_SIGNAL'
  | 'ENTITY_RELATIONSHIP'
  | 'LANGUAGE_SIGNAL'
  | 'SCRIPT_SIGNAL'
  | 'STRUCTURAL_SIGNAL'
  | 'NEGATIVE_CONTEXT_SIGNAL'
  | 'AMBIGUITY_SIGNAL';

export type SemanticRole =
  | 'PERSON_NAME'
  | 'CONTACT_FIELD'
  | 'IDENTIFIER_FIELD'
  | 'FINANCIAL_FIELD'
  | 'ADDRESS_FIELD'
  | 'DATE_FIELD'
  | 'SECURITY_CREDENTIAL_FIELD'
  | 'LOCATION_FIELD'
  | 'FREE_TEXT'
  | 'UNKNOWN';

export type AmbiguityIndicator =
  | 'AMBIGUOUS_LABEL'
  | 'WEAK_CONTEXT'
  | 'CONFLICTING_CONTEXT'
  | 'MULTIPLE_SEMANTIC_INTERPRETATIONS'
  | 'INSUFFICIENT_CONTEXT';

export type RelationshipType =
  | 'PERSON_NAME_EMAIL'
  | 'PERSON_NAME_PHONE'
  | 'PERSON_NAME_ADDRESS'
  | 'PERSON_NAME_DOB'
  | 'IDENTIFIER_OWNER'
  | 'UNKNOWN';

export type RelationshipStatus = 'SUPPORTED' | 'WEAK' | 'CONFLICTING' | 'UNKNOWN';

export interface FieldLabelPattern {
  role: SemanticRole;
  positiveKeywords: string[];
  negativeKeywords: string[];
}

export const CONTEXT_FIELD_LABELS: Record<string, FieldLabelPattern> = {
  PERSON_NAME: {
    role: 'PERSON_NAME',
    positiveKeywords: [
      'name',
      'full name',
      'customer name',
      'employee name',
      'patient name',
      'applicant name',
      'user name',
      'holder name',
      'first name',
      'last name',
    ],
    negativeKeywords: ['example person', 'john smith corporation', 'sample name', 'template name'],
  },
  CONTACT_FIELD: {
    role: 'CONTACT_FIELD',
    positiveKeywords: [
      'email',
      'e-mail',
      'email address',
      'mail',
      'phone',
      'mobile',
      'contact number',
      'phone number',
      'telephone',
      'cell',
      'fax',
    ],
    negativeKeywords: ['example email', 'dummy phone', 'test email', 'placeholder phone'],
  },
  IDENTIFIER_FIELD: {
    role: 'IDENTIFIER_FIELD',
    positiveKeywords: [
      'ssn',
      'social security',
      'aadhaar',
      'uidai',
      'pan',
      'permanent account number',
      'national id',
      'passport',
      'voter id',
      'driver license',
      'license number',
      'id number',
    ],
    negativeKeywords: ['sample ssn', 'dummy aadhaar', 'test pan', 'example id'],
  },
  FINANCIAL_FIELD: {
    role: 'FINANCIAL_FIELD',
    positiveKeywords: [
      'card number',
      'credit card',
      'debit card',
      'account number',
      'account no',
      'iban',
      'bank account',
      'routing number',
      'cvv',
      'billing',
      'invoice',
    ],
    negativeKeywords: ['invoice number', 'order id', 'product code', 'reference number', 'transaction id'],
  },
  ADDRESS_FIELD: {
    role: 'ADDRESS_FIELD',
    positiveKeywords: [
      'address',
      'street',
      'city',
      'state',
      'zip',
      'zipcode',
      'postal code',
      'pin code',
      'country',
      'residence',
      'office address',
    ],
    negativeKeywords: ['example city', 'sample address', 'template street'],
  },
  DATE_FIELD: {
    role: 'DATE_FIELD',
    positiveKeywords: ['dob', 'date of birth', 'birth date', 'issue date', 'expiry date', 'creation date'],
    negativeKeywords: ['sample date', 'current date', 'today'],
  },
  SECURITY_CREDENTIAL_FIELD: {
    role: 'SECURITY_CREDENTIAL_FIELD',
    positiveKeywords: [
      'api key',
      'secret',
      'token',
      'bearer',
      'authorization',
      'private key',
      'access key',
      'password',
      'credential',
    ],
    negativeKeywords: ['placeholder key', 'example token', 'sample key'],
  },
};

export const CONTEXT_CONFIGURATION_VERSION = '1.0.0';

export function generateContextConfigurationHash(): string {
  const serialized = JSON.stringify({
    version: CONTEXT_CONFIGURATION_VERSION,
    labels: CONTEXT_FIELD_LABELS,
  });
  return crypto.createHash('sha256').update(serialized).digest('hex');
}
