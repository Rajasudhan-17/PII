import path from 'path';
import { MetadataInventoryItem, MetadataInventoryReport } from './metadata.inventory';

export class FilenameMetadataVerifier {
  public static verify(
    publishedFilename: string,
    originalFilename?: string
  ): MetadataInventoryReport {
    const items: MetadataInventoryItem[] = [];
    const warnings: Array<{ code: string; message: string }> = [];
    let residualMetadataCount = 0;

    const ext = path.extname(publishedFilename);

    const piiPatterns = [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email
      /(?:\b|_)\d{3}-\d{2}-\d{4}(?:\b|_)/, // SSN
      /(?:\b|_)\d{10}(?:\b|_)/, // Phone/ID
      /(passport|ssn|invoice|salary|tax|medical|secret|private)/i, // Sensitive label keywords
    ];

    const hasPii = piiPatterns.some((pattern) => pattern.test(publishedFilename));
    if (hasPii) {
      residualMetadataCount++;
      items.push({
        category: 'FILENAME_METADATA',
        format: ext.replace('.', ''),
        targetPath: `publishedFilename:${publishedFilename}`,
        classification: 'POLICY_CONTROLLED',
        presence: true,
        expectedAction: 'REMOVE',
        verificationStatus: 'PRESENT_AND_REQUIRES_REMOVAL',
        reason: 'Published output filename contains unredacted sensitive PII patterns or keywords',
      });
    } else {
      items.push({
        category: 'FILENAME_METADATA',
        format: ext.replace('.', ''),
        targetPath: `publishedFilename:${publishedFilename}`,
        classification: 'POLICY_CONTROLLED',
        presence: false,
        expectedAction: 'REMOVE',
        verificationStatus: 'REMOVED_AND_VERIFIED',
        reason: 'Verified output filename is non-sensitive and free of PII patterns',
      });
    }

    if (originalFilename && publishedFilename === originalFilename && piiPatterns.some((pattern) => pattern.test(originalFilename))) {
      residualMetadataCount++;
      items.push({
        category: 'FILENAME_METADATA',
        format: ext.replace('.', ''),
        targetPath: `originalFilename:${originalFilename}`,
        classification: 'POLICY_CONTROLLED',
        presence: true,
        expectedAction: 'REMOVE',
        verificationStatus: 'VERIFICATION_FAILED',
        reason: 'Published filename matched sensitive original filename without safe anonymization',
      });
    }

    const isVerified = residualMetadataCount === 0;

    return {
      isVerified,
      residualMetadataCount,
      unsupportedCount: 0,
      items,
      warnings,
    };
  }
}
