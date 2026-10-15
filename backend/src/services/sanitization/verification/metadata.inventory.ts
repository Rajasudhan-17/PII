export type MetadataVerificationState =
  | 'NOT_PRESENT'
  | 'PRESENT_AND_ALLOWED'
  | 'PRESENT_AND_REQUIRES_REMOVAL'
  | 'REMOVED_AND_VERIFIED'
  | 'UNSUPPORTED'
  | 'VERIFICATION_FAILED';

export interface MetadataInventoryItem {
  category: string;
  format: string;
  targetPath: string;
  classification: 'REMOVE' | 'PRESERVE' | 'POLICY_CONTROLLED' | 'UNSUPPORTED';
  presence: boolean;
  expectedAction: 'REMOVE' | 'PRESERVE' | 'POLICY_CONTROLLED';
  verificationStatus: MetadataVerificationState;
  reason: string;
  warningCode?: string;
}

export interface MetadataInventoryReport {
  isVerified: boolean;
  residualMetadataCount: number;
  unsupportedCount: number;
  items: MetadataInventoryItem[];
  warnings: Array<{ code: string; message: string }>;
}
