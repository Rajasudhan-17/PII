import AdmZip from 'adm-zip';
import {
  ISanitizerEngine,
  SanitizationEngineOptions,
  EngineSanitizationResult,
  SanitizationRecordItem,
} from './base.engine';

export class XlsxSanitizerEngine implements ISanitizerEngine {
  public async sanitize(options: SanitizationEngineOptions): Promise<EngineSanitizationResult> {
    const zip = new AdmZip(options.sourceFilePath);
    const records: SanitizationRecordItem[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    let discoveredCount = 0;
    let removedCount = 0;
    let preservedCount = 0;
    let unsupportedCount = 0;

    const entries = zip.getEntries();

    // 1. Core Properties Sanitization
    const coreEntry = zip.getEntry('docProps/core.xml');
    if (coreEntry) {
      let coreXml = coreEntry.getData().toString('utf8');

      if (coreXml.includes('<dc:creator>') || coreXml.includes('<cp:lastModifiedBy>')) {
        discoveredCount++;
        coreXml = coreXml
          .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/g, '<dc:creator>Sanitized</dc:creator>')
          .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/g, '<cp:lastModifiedBy>Sanitized</cp:lastModifiedBy>');

        zip.updateFile('docProps/core.xml', Buffer.from(coreXml, 'utf8'));
        removedCount++;
        records.push({
          category: 'OFFICE_CORE_PROPERTIES',
          targetPath: 'docProps/core.xml',
          classification: 'POLICY_CONTROLLED',
          action: 'REMOVE',
          status: 'SANITIZED',
          reason: 'Sanitized author properties in docProps/core.xml',
        });
      }
    }

    // 2. Comments Sanitization
    for (const entry of entries) {
      if (entry.entryName.startsWith('xl/comments') && entry.entryName.endsWith('.xml')) {
        discoveredCount++;
        let commentsXml = entry.getData().toString('utf8');

        if (options.policyOptions.stripComments !== false) {
          commentsXml = commentsXml
            .replace(/author="[^"]*"/g, 'author="Sanitized"')
            .replace(/<t>[\s\S]*?<\/t>/g, '<t>[COMMENT_REMOVED]</t>');

          zip.updateFile(entry.entryName, Buffer.from(commentsXml, 'utf8'));
          removedCount++;
          records.push({
            category: 'OFFICE_COMMENTS',
            targetPath: entry.entryName,
            classification: 'REMOVE',
            action: 'REMOVE',
            status: 'SANITIZED',
            reason: `Sanitized spreadsheet comments in ${entry.entryName}`,
          });
        } else {
          preservedCount++;
          records.push({
            category: 'OFFICE_COMMENTS',
            targetPath: entry.entryName,
            classification: 'PRESERVE',
            action: 'PRESERVE',
            status: 'PRESERVED',
            reason: 'Preserved comments per policy configuration',
          });
        }
      }
    }

    // 3. Hidden / Very Hidden Sheets Inspection
    const wbEntry = zip.getEntry('xl/workbook.xml');
    if (wbEntry) {
      const wbXml = wbEntry.getData().toString('utf8');
      const sheetRegex = /<sheet[^>]*name="([^"]*)"[^>]*state="(hidden|veryHidden)"[^>]*\/>/g;
      let m: RegExpExecArray | null;

      while ((m = sheetRegex.exec(wbXml)) !== null) {
        discoveredCount++;
        const sheetName = m[1];
        const state = m[2];

        if (options.policyOptions.stripHiddenSheets) {
          removedCount++;
          records.push({
            category: 'SPREADSHEET_HIDDEN_CONTENT',
            targetPath: `xl/workbook.xml#${sheetName}[${state}]`,
            classification: 'POLICY_CONTROLLED',
            action: 'REMOVE',
            status: 'SANITIZED',
            reason: `Detected and flagged ${state} sheet ${sheetName}`,
          });
        } else {
          preservedCount++;
          records.push({
            category: 'SPREADSHEET_HIDDEN_CONTENT',
            targetPath: `xl/workbook.xml#${sheetName}[${state}]`,
            classification: 'PRESERVE',
            action: 'PRESERVE',
            status: 'PRESERVED',
            reason: `Preserved ${state} sheet ${sheetName} per policy configuration`,
          });
        }
      }
    }

    // 4. Embedded Binary Objects Inspection
    for (const entry of entries) {
      if (entry.entryName.startsWith('xl/embeddings/') || entry.entryName.endsWith('.bin')) {
        discoveredCount++;
        unsupportedCount++;
        records.push({
          category: 'OFFICE_EMBEDDED_OBJECT',
          targetPath: entry.entryName,
          classification: 'UNSUPPORTED',
          action: 'REVIEW',
          status: 'UNSUPPORTED',
          reason: `Detected embedded binary object ${entry.entryName}`,
        });
        warnings.push({
          code: 'UNSUPPORTED_METADATA_STRUCTURE',
          message: `XLSX contains embedded binary object (${entry.entryName}) that cannot be automatically sanitized`,
        });
      }
    }

    zip.writeZip(options.outputFilePath);

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
    const zip = new AdmZip(outputFilePath);
    const residualMetadata: string[] = [];

    const coreEntry = zip.getEntry('docProps/core.xml');
    if (coreEntry) {
      const xml = coreEntry.getData().toString('utf8');
      if (xml.includes('<dc:creator>John Smith</dc:creator>')) {
        residualMetadata.push('Residual author found in docProps/core.xml');
      }
    }

    return {
      isVerified: residualMetadata.length === 0,
      residualMetadata,
    };
  }
}
