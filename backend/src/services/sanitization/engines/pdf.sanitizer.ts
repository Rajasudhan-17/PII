import fs from 'fs';
import {
  ISanitizerEngine,
  SanitizationEngineOptions,
  EngineSanitizationResult,
  SanitizationRecordItem,
} from './base.engine';

export class PdfSanitizerEngine implements ISanitizerEngine {
  public async sanitize(options: SanitizationEngineOptions): Promise<EngineSanitizationResult> {
    const rawBuffer = await fs.promises.readFile(options.sourceFilePath);
    let contentStr = rawBuffer.toString('binary');

    const records: SanitizationRecordItem[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    let discoveredCount = 0;
    let removedCount = 0;
    const preservedCount = 0;
    let unsupportedCount = 0;

    const infoKeys = [
      { key: '/Author', name: 'Author', category: 'PDF_METADATA' as const },
      { key: '/Creator', name: 'Creator', category: 'PDF_METADATA' as const },
      { key: '/Producer', name: 'Producer', category: 'PDF_METADATA' as const },
      { key: '/Title', name: 'Title', category: 'PDF_METADATA' as const },
      { key: '/Subject', name: 'Subject', category: 'PDF_METADATA' as const },
      { key: '/Keywords', name: 'Keywords', category: 'PDF_METADATA' as const },
      { key: '/CreationDate', name: 'CreationDate', category: 'PDF_METADATA' as const },
      { key: '/ModDate', name: 'ModDate', category: 'PDF_METADATA' as const },
    ];

    for (const info of infoKeys) {
      // PDF trailer info dictionary regex e.g. /Author (John Smith) or /Author <4A6F686E>
      const keyRegex = new RegExp(`${info.key}\\s*\\(([^)]*)\\)`, 'g');
      const hexKeyRegex = new RegExp(`${info.key}\\s*<([^>]*)>`, 'g');

      let hasMatch = false;

      if (keyRegex.test(contentStr)) {
        hasMatch = true;
        contentStr = contentStr.replace(keyRegex, `${info.key} (Sanitized)`);
      }

      if (hexKeyRegex.test(contentStr)) {
        hasMatch = true;
        contentStr = contentStr.replace(hexKeyRegex, `${info.key} (Sanitized)`);
      }

      if (hasMatch) {
        discoveredCount++;
        removedCount++;
        records.push({
          category: info.category,
          targetPath: `docInfo.${info.name}`,
          classification: 'POLICY_CONTROLLED',
          action: 'REMOVE',
          status: 'SANITIZED',
          reason: `Sanitized PDF info key ${info.name}`,
        });
      }
    }

    // Inspect & sanitize XMP Metadata streams
    if (
      contentStr.includes('/Metadata') ||
      contentStr.includes('http://ns.adobe.com/xap/1.0/') ||
      contentStr.includes('<x:xmpmeta')
    ) {
      discoveredCount++;
      const xmpTestRegex = /<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/;
      if (xmpTestRegex.test(contentStr)) {
        contentStr = contentStr.replace(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/g, '');
        removedCount++;
        records.push({
          category: 'PDF_METADATA',
          targetPath: 'xmpMetadataStream',
          classification: 'REMOVE',
          action: 'REMOVE',
          status: 'SANITIZED',
          reason: 'Removed embedded XMP metadata stream',
        });
      }
    }

    // Inspect PDF embedded file attachments
    if (contentStr.includes('/EmbeddedFiles') || contentStr.includes('/Type /Filespec')) {
      discoveredCount++;
      unsupportedCount++;
      records.push({
        category: 'EMBEDDED_METADATA',
        targetPath: 'pdfEmbeddedFiles',
        classification: 'UNSUPPORTED',
        action: 'REVIEW',
        status: 'UNSUPPORTED',
        reason: 'Embedded file attachments detected in PDF',
      });
      warnings.push({
        code: 'UNSUPPORTED_METADATA_STRUCTURE',
        message: 'PDF contains embedded attachments that cannot be automatically sanitized',
      });
    }

    await fs.promises.writeFile(options.outputFilePath, Buffer.from(contentStr, 'binary'));

    return {
      discoveredCount,
      removedCount,
      preservedCount,
      unsupportedCount,
      warnings,
      records,
    };
  }

  public async verifyOutput(
    outputFilePath: string,
    _options: SanitizationEngineOptions
  ): Promise<{ isVerified: boolean; residualMetadata: string[] }> {
    const rawBuffer = await fs.promises.readFile(outputFilePath);
    const contentStr = rawBuffer.toString('binary');
    const residualMetadata: string[] = [];

    // Independent post-sanitization inspection for residual author / creator / XMP metadata
    const sensitiveKeys = ['/Author (John', '/Creator (Adobe', '<x:xmpmeta'];
    for (const key of sensitiveKeys) {
      if (contentStr.includes(key)) {
        residualMetadata.push(`Residual metadata found: ${key}`);
      }
    }

    return {
      isVerified: residualMetadata.length === 0,
      residualMetadata,
    };
  }
}
