export enum PIICategory {
  DIRECT_IDENTIFIER = 'DIRECT_IDENTIFIER',
  INDIRECT_IDENTIFIER = 'INDIRECT_IDENTIFIER',
  CONTACT_INFORMATION = 'CONTACT_INFORMATION',
  FINANCIAL_INFORMATION = 'FINANCIAL_INFORMATION',
  GOVERNMENT_ID = 'GOVERNMENT_ID',
  HEALTH_INFORMATION = 'HEALTH_INFORMATION',
  BIOMETRIC_DATA = 'BIOMETRIC_DATA',
  SECURITY_CREDENTIAL = 'SECURITY_CREDENTIAL',
  LOCATION_DATA = 'LOCATION_DATA',
  SENSITIVE_PERSONAL_DATA = 'SENSITIVE_PERSONAL_DATA',
}

export enum PIIType {
  EMAIL_ADDRESS = 'EMAIL_ADDRESS',
  PHONE_NUMBER = 'PHONE_NUMBER',
  CREDIT_CARD_NUMBER = 'CREDIT_CARD_NUMBER',
  IBAN = 'IBAN',
  US_SSN = 'US_SSN',
  INDIAN_PAN = 'INDIAN_PAN',
  INDIAN_AADHAAR = 'INDIAN_AADHAAR',
  AUTH_TOKEN_KEY = 'AUTH_TOKEN_KEY',
  PERSON_NAME = 'PERSON_NAME',
  POSTAL_ADDRESS = 'POSTAL_ADDRESS',
  CITY = 'CITY',
  DATE_OF_BIRTH = 'DATE_OF_BIRTH',
  IP_ADDRESS = 'IP_ADDRESS',
  GPS_COORDINATES = 'GPS_COORDINATES',
  PASSPORT = 'PASSPORT',
  DRIVING_LICENSE = 'DRIVING_LICENSE',
  UNKNOWN_PII = 'UNKNOWN_PII',
}

export enum PIISeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface PIITypeMetadata {
  category: PIICategory;
  defaultSeverity: PIISeverity;
  defaultSensitivityScore: number;
}

export const PII_TYPE_METADATA_MAP: Record<PIIType, PIITypeMetadata> = {
  [PIIType.EMAIL_ADDRESS]: {
    category: PIICategory.CONTACT_INFORMATION,
    defaultSeverity: PIISeverity.MEDIUM,
    defaultSensitivityScore: 0.75,
  },
  [PIIType.PHONE_NUMBER]: {
    category: PIICategory.CONTACT_INFORMATION,
    defaultSeverity: PIISeverity.MEDIUM,
    defaultSensitivityScore: 0.7,
  },
  [PIIType.CREDIT_CARD_NUMBER]: {
    category: PIICategory.FINANCIAL_INFORMATION,
    defaultSeverity: PIISeverity.CRITICAL,
    defaultSensitivityScore: 0.95,
  },
  [PIIType.IBAN]: {
    category: PIICategory.FINANCIAL_INFORMATION,
    defaultSeverity: PIISeverity.HIGH,
    defaultSensitivityScore: 0.9,
  },
  [PIIType.US_SSN]: {
    category: PIICategory.GOVERNMENT_ID,
    defaultSeverity: PIISeverity.CRITICAL,
    defaultSensitivityScore: 0.98,
  },
  [PIIType.INDIAN_PAN]: {
    category: PIICategory.GOVERNMENT_ID,
    defaultSeverity: PIISeverity.HIGH,
    defaultSensitivityScore: 0.88,
  },
  [PIIType.INDIAN_AADHAAR]: {
    category: PIICategory.GOVERNMENT_ID,
    defaultSeverity: PIISeverity.CRITICAL,
    defaultSensitivityScore: 0.95,
  },
  [PIIType.AUTH_TOKEN_KEY]: {
    category: PIICategory.SECURITY_CREDENTIAL,
    defaultSeverity: PIISeverity.CRITICAL,
    defaultSensitivityScore: 0.99,
  },
  [PIIType.PERSON_NAME]: {
    category: PIICategory.DIRECT_IDENTIFIER,
    defaultSeverity: PIISeverity.MEDIUM,
    defaultSensitivityScore: 0.65,
  },
  [PIIType.POSTAL_ADDRESS]: {
    category: PIICategory.LOCATION_DATA,
    defaultSeverity: PIISeverity.MEDIUM,
    defaultSensitivityScore: 0.6,
  },
  [PIIType.CITY]: {
    category: PIICategory.LOCATION_DATA,
    defaultSeverity: PIISeverity.LOW,
    defaultSensitivityScore: 0.3,
  },
  [PIIType.DATE_OF_BIRTH]: {
    category: PIICategory.INDIRECT_IDENTIFIER,
    defaultSeverity: PIISeverity.MEDIUM,
    defaultSensitivityScore: 0.7,
  },
  [PIIType.IP_ADDRESS]: {
    category: PIICategory.LOCATION_DATA,
    defaultSeverity: PIISeverity.LOW,
    defaultSensitivityScore: 0.4,
  },
  [PIIType.GPS_COORDINATES]: {
    category: PIICategory.LOCATION_DATA,
    defaultSeverity: PIISeverity.MEDIUM,
    defaultSensitivityScore: 0.6,
  },
  [PIIType.PASSPORT]: {
    category: PIICategory.GOVERNMENT_ID,
    defaultSeverity: PIISeverity.HIGH,
    defaultSensitivityScore: 0.9,
  },
  [PIIType.DRIVING_LICENSE]: {
    category: PIICategory.GOVERNMENT_ID,
    defaultSeverity: PIISeverity.HIGH,
    defaultSensitivityScore: 0.85,
  },
  [PIIType.UNKNOWN_PII]: {
    category: PIICategory.SENSITIVE_PERSONAL_DATA,
    defaultSeverity: PIISeverity.LOW,
    defaultSensitivityScore: 0.5,
  },
};

export function getPIIMetadata(piiType: PIIType): PIITypeMetadata {
  return (
    PII_TYPE_METADATA_MAP[piiType] || {
      category: PIICategory.SENSITIVE_PERSONAL_DATA,
      defaultSeverity: PIISeverity.LOW,
      defaultSensitivityScore: 0.5,
    }
  );
}
