import {
  MetadataCategory,
  MetadataClassification,
  MetadataSanitizationAction,
  MetadataRecordStatus,
} from '../../../models/metadataSanitizationResult.model';

export interface SanitizationPolicyOptions {
  stripAuthor?: boolean;
  stripTimestamps?: boolean;
  stripComments?: boolean;
  stripTrackedRevisions?: boolean;
  stripHiddenSheets?: boolean;
  stripSpeakerNotes?: boolean;
  stripExif?: boolean;
  stripGps?: boolean;
  stripDeviceMetadata?: boolean;
  sanitizeFilename?: boolean;
}

export interface SanitizationEngineOptions {
  sourceFilePath: string;
  outputFilePath: string;
  filename: string;
  mimeType: string;
  extension: string;
  policyOptions: SanitizationPolicyOptions;
}

export interface SanitizationRecordItem {
  category: MetadataCategory;
  targetPath: string;
  classification: MetadataClassification;
  action: MetadataSanitizationAction;
  status: MetadataRecordStatus;
  reason?: string;
}

export interface EngineSanitizationResult {
  discoveredCount: number;
  removedCount: number;
  preservedCount: number;
  unsupportedCount: number;
  warnings: Array<{ code: string; message: string }>;
  records: SanitizationRecordItem[];
  cleanFilename?: string;
}

export interface ISanitizerEngine {
  sanitize(options: SanitizationEngineOptions): Promise<EngineSanitizationResult>;
  verifyOutput(outputFilePath: string, options: SanitizationEngineOptions): Promise<{ isVerified: boolean; residualMetadata: string[] }>;
}
