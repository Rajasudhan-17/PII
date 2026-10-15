import fs from 'fs';
import { MetadataInventoryItem, MetadataInventoryReport } from './metadata.inventory';
import { SanitizationPolicyOptions } from '../engines/base.engine';

export class PdfMetadataVerifier {
  public static async verify(
    outputPath: string,
    _policyOptions?: SanitizationPolicyOptions
  ): Promise<MetadataInventoryReport> {
    const rawBuffer = await fs.promises.readFile(outputPath);
    const contentStr = rawBuffer.toString('binary');

    const items: MetadataInventoryItem[] = [];
    const warnings: Array<{ code: string; message: string }> = [];
    let residualMetadataCount = 0;
    let unsupportedCount = 0;

    // 1. Inspect PDF Info Dictionary keys
    const infoKeys = [
      { key: '/Author', name: 'Author' },
      { key: '/Creator', name: 'Creator' },
      { key: '/Producer', name: 'Producer' },
      { key: '/Subject', name: 'Subject' },
      { key: '/Title', name: 'Title' },
      { key: '/Keywords', name: 'Keywords' },
      { key: '/CreationDate', name: 'CreationDate' },
      { key: '/ModDate', name: 'ModDate' },
    ];

    for (const info of infoKeys) {
      // Search for un-sanitized values or residual values
      const keyRegex = new RegExp(`${info.key}\\s*\\((?!Sanitized\\))([^\\)]+)\\)`, 'i');
      const hexKeyRegex = new RegExp(`${info.key}\\s*<([0-9a-fA-F]+)>`, 'i');

      const match = keyRegex.test(contentStr) || hexKeyRegex.test(contentStr);
      if (match) {
        residualMetadataCount++;
        items.push({
          category: 'PDF_METADATA',
          format: 'pdf',
          targetPath: `docInfo.${info.name}`,
          classification: 'POLICY_CONTROLLED',
          presence: true,
          expectedAction: 'REMOVE',
          verificationStatus: 'PRESENT_AND_REQUIRES_REMOVAL',
          reason: `Residual PDF info dictionary metadata found: ${info.name}`,
        });
      } else {
        const sanitizedKey = contentStr.includes(`${info.key} (Sanitized)`);
        items.push({
          category: 'PDF_METADATA',
          format: 'pdf',
          targetPath: `docInfo.${info.name}`,
          classification: 'POLICY_CONTROLLED',
          presence: sanitizedKey,
          expectedAction: 'REMOVE',
          verificationStatus: sanitizedKey ? 'REMOVED_AND_VERIFIED' : 'NOT_PRESENT',
          reason: sanitizedKey
            ? `Verified sanitized key ${info.name}`
            : `Metadata key ${info.name} not present in output`,
        });
      }
    }

    // 2. Inspect XMP Metadata streams independently
    const xmpPresent = /<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/.test(contentStr);
    if (xmpPresent) {
      residualMetadataCount++;
      items.push({
        category: 'PDF_METADATA',
        format: 'pdf',
        targetPath: 'xmpMetadataStream',
        classification: 'REMOVE',
        presence: true,
        expectedAction: 'REMOVE',
        verificationStatus: 'PRESENT_AND_REQUIRES_REMOVAL',
        reason: 'Residual XMP metadata stream found in PDF output artifact',
      });
    } else {
      items.push({
        category: 'PDF_METADATA',
        format: 'pdf',
        targetPath: 'xmpMetadataStream',
        classification: 'REMOVE',
        presence: false,
        expectedAction: 'REMOVE',
        verificationStatus: 'REMOVED_AND_VERIFIED',
        reason: 'Verified absence of XMP metadata stream in output PDF',
      });
    }

    // 3. Inspect Embedded Files
    if (contentStr.includes('/EmbeddedFiles') || contentStr.includes('/Type /Filespec')) {
      unsupportedCount++;
      warnings.push({
        code: 'UNSUPPORTED_EMBEDDED_OBJECT',
        message: 'PDF contains embedded files which cannot be sanitized safely',
      });
      items.push({
        category: 'EMBEDDED_METADATA',
        format: 'pdf',
        targetPath: 'embeddedFiles',
        classification: 'UNSUPPORTED',
        presence: true,
        expectedAction: 'REMOVE',
        verificationStatus: 'UNSUPPORTED',
        reason: 'Embedded PDF files present',
        warningCode: 'UNSUPPORTED_EMBEDDED_OBJECT',
      });
    }

    const isVerified = residualMetadataCount === 0;

    return {
      isVerified,
      residualMetadataCount,
      unsupportedCount,
      items,
      warnings,
    };
  }
}
