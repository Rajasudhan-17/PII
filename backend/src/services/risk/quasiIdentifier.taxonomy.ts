export type QuasiIdentifierCategory =
  | 'DEMOGRAPHIC'
  | 'GEOGRAPHIC'
  | 'TEMPORAL'
  | 'PROFESSIONAL'
  | 'EDUCATIONAL'
  | 'BEHAVIORAL'
  | 'DOCUMENT_SPECIFIC';

export interface QuasiIdentifierDefinition {
  type: string;
  category: QuasiIdentifierCategory;
  baseUniquenessWeight: number; // 0.0 to 1.0
  precisionLevels?: string[];
}

export const QUASI_IDENTIFIER_TAXONOMY: Record<string, QuasiIdentifierDefinition> = {
  // Demographic
  AGE: { type: 'AGE', category: 'DEMOGRAPHIC', baseUniquenessWeight: 0.10 },
  DATE_OF_BIRTH: { type: 'DATE_OF_BIRTH', category: 'DEMOGRAPHIC', baseUniquenessWeight: 0.45 },
  GENDER: { type: 'GENDER', category: 'DEMOGRAPHIC', baseUniquenessWeight: 0.05 },
  NATIONALITY: { type: 'NATIONALITY', category: 'DEMOGRAPHIC', baseUniquenessWeight: 0.15 },

  // Geographic
  COUNTRY: { type: 'COUNTRY', category: 'GEOGRAPHIC', baseUniquenessWeight: 0.05, precisionLevels: ['Country'] },
  STATE: { type: 'STATE', category: 'GEOGRAPHIC', baseUniquenessWeight: 0.10, precisionLevels: ['State'] },
  CITY: { type: 'CITY', category: 'GEOGRAPHIC', baseUniquenessWeight: 0.25, precisionLevels: ['City'] },
  DISTRICT: { type: 'DISTRICT', category: 'GEOGRAPHIC', baseUniquenessWeight: 0.35, precisionLevels: ['District'] },
  POSTAL_CODE: { type: 'POSTAL_CODE', category: 'GEOGRAPHIC', baseUniquenessWeight: 0.50, precisionLevels: ['PostalCode'] },
  NEIGHBORHOOD: { type: 'NEIGHBORHOOD', category: 'GEOGRAPHIC', baseUniquenessWeight: 0.60, precisionLevels: ['Neighborhood'] },
  STREET_ADDRESS: { type: 'STREET_ADDRESS', category: 'GEOGRAPHIC', baseUniquenessWeight: 0.85, precisionLevels: ['Street'] },
  LOCATION: { type: 'LOCATION', category: 'GEOGRAPHIC', baseUniquenessWeight: 0.40, precisionLevels: ['Location'] },
  GPS_COORDINATE: { type: 'GPS_COORDINATE', category: 'GEOGRAPHIC', baseUniquenessWeight: 0.95, precisionLevels: ['GPS'] },

  // Temporal
  YEAR: { type: 'YEAR', category: 'TEMPORAL', baseUniquenessWeight: 0.05, precisionLevels: ['Year'] },
  MONTH: { type: 'MONTH', category: 'TEMPORAL', baseUniquenessWeight: 0.15, precisionLevels: ['Month'] },
  DATE: { type: 'DATE', category: 'TEMPORAL', baseUniquenessWeight: 0.45, precisionLevels: ['Date'] },
  TIMESTAMP: { type: 'TIMESTAMP', category: 'TEMPORAL', baseUniquenessWeight: 0.85, precisionLevels: ['Timestamp'] },
  EVENT_DATE: { type: 'EVENT_DATE', category: 'TEMPORAL', baseUniquenessWeight: 0.50, precisionLevels: ['Date'] },

  // Professional
  EMPLOYER: { type: 'EMPLOYER', category: 'PROFESSIONAL', baseUniquenessWeight: 0.35 },
  ORGANIZATION: { type: 'ORGANIZATION', category: 'PROFESSIONAL', baseUniquenessWeight: 0.30 },
  DEPARTMENT: { type: 'DEPARTMENT', category: 'PROFESSIONAL', baseUniquenessWeight: 0.35 },
  JOB_TITLE: { type: 'JOB_TITLE', category: 'PROFESSIONAL', baseUniquenessWeight: 0.40 },
  SPECIALIZATION: { type: 'SPECIALIZATION', category: 'PROFESSIONAL', baseUniquenessWeight: 0.55 },

  // Educational
  INSTITUTION: { type: 'INSTITUTION', category: 'EDUCATIONAL', baseUniquenessWeight: 0.35 },
  DEGREE_COURSE: { type: 'DEGREE_COURSE', category: 'EDUCATIONAL', baseUniquenessWeight: 0.30 },
  GRADUATION_YEAR: { type: 'GRADUATION_YEAR', category: 'EDUCATIONAL', baseUniquenessWeight: 0.20 },

  // Behavioral / Document
  EVENT_NAME: { type: 'EVENT_NAME', category: 'BEHAVIORAL', baseUniquenessWeight: 0.50 },
  CASE_NUMBER: { type: 'CASE_NUMBER', category: 'DOCUMENT_SPECIFIC', baseUniquenessWeight: 0.75 },
  INVOICE_NUMBER: { type: 'INVOICE_NUMBER', category: 'DOCUMENT_SPECIFIC', baseUniquenessWeight: 0.70 },
};

export const classifyAttribute = (typeStr: string): QuasiIdentifierDefinition => {
  const upper = typeStr.toUpperCase().replace(/\s+/g, '_');
  return (
    QUASI_IDENTIFIER_TAXONOMY[upper] || {
      type: upper,
      category: 'DOCUMENT_SPECIFIC',
      baseUniquenessWeight: 0.25,
    }
  );
};
