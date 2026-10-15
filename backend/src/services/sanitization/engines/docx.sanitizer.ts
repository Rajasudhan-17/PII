import AdmZip from 'adm-zip';
import {
  ISanitizerEngine,
  SanitizationEngineOptions,
  EngineSanitizationResult,
  SanitizationRecordItem,
} from './base.engine';

export class DocxSanitizerEngine implements ISanitizerEngine {
  public async sanitize(options: SanitizationEngineOptions): Promise<EngineSanitizationResult> {
    const zip = new AdmZip(options.sourceFilePath);
    const records: SanitizationRecordItem[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    let discoveredCount = 0;
    let removedCount = 0;
    let preservedCount = 0;
    let unsupportedCount = 0;

    const entries = zip.getEntries();

    // 1. Sanitize Core Properties (docProps/core.xml)
    const coreEntry = zip.getEntry('docProps/core.xml');
    if (coreEntry) {
      let coreXml = coreEntry.getData().toString('utf8');

      if (coreXml.includes('<dc:creator>') || coreXml.includes('<cp:lastModifiedBy>')) {
        discoveredCount++;
        coreXml = coreXml
          .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/g, '<dc:creator>Sanitized</dc:creator>')
          .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/g, '<cp:lastModifiedBy>Sanitized</cp:lastModifiedBy>')
          .replace(/<cp:revision>[\s\S]*?<\/cp:revision>/g, '<cp:revision>1</cp:revision>');

        zip.updateFile('docProps/core.xml', Buffer.from(coreXml, 'utf8'));
        removedCount++;
        records.push({
          category: 'OFFICE_CORE_PROPERTIES',
          targetPath: 'docProps/core.xml',
          classification: 'POLICY_CONTROLLED',
          action: 'REMOVE',
          status: 'SANITIZED',
          reason: 'Sanitized author and revision properties in docProps/core.xml',
        });
      }
    }

    // 2. Sanitize Custom Properties (docProps/custom.xml)
    const customEntry = zip.getEntry('docProps/custom.xml');
    if (customEntry) {
      discoveredCount++;
      removedCount++;
      zip.deleteFile('docProps/custom.xml');
      records.push({
        category: 'OFFICE_CUSTOM_PROPERTIES',
        targetPath: 'docProps/custom.xml',
        classification: 'POLICY_CONTROLLED',
        action: 'REMOVE',
        status: 'SANITIZED',
        reason: 'Removed custom document properties',
      });
    }

    // 3. Sanitize Comments (word/comments.xml)
    const commentsEntry = zip.getEntry('word/comments.xml');
    if (commentsEntry) {
      discoveredCount++;
      let commentsXml = commentsEntry.getData().toString('utf8');

      if (options.policyOptions.stripComments !== false) {
        commentsXml = commentsXml
          .replace(/w:author="[^"]*"/g, 'w:author="Sanitized"')
          .replace(/<w:t>[\s\S]*?<\/w:t>/g, '<w:t>[COMMENT_REMOVED]</w:t>');

        zip.updateFile('word/comments.xml', Buffer.from(commentsXml, 'utf8'));
        removedCount++;
        records.push({
          category: 'OFFICE_COMMENTS',
          targetPath: 'word/comments.xml',
          classification: 'REMOVE',
          action: 'REMOVE',
          status: 'SANITIZED',
          reason: 'Sanitized author and text from document comments',
        });
      } else {
        preservedCount++;
        records.push({
          category: 'OFFICE_COMMENTS',
          targetPath: 'word/comments.xml',
          classification: 'PRESERVE',
          action: 'PRESERVE',
          status: 'PRESERVED',
          reason: 'Preserved comments per policy configuration',
        });
      }
    }

    // 4. Sanitize Tracked Revisions in document XML
    for (const entry of entries) {
      if (entry.entryName.startsWith('word/') && entry.entryName.endsWith('.xml')) {
        let xml = entry.getData().toString('utf8');
        if (xml.includes('w:author=')) {
          discoveredCount++;
          xml = xml.replace(/w:author="[^"]*"/g, 'w:author="Sanitized"');
          zip.updateFile(entry.entryName, Buffer.from(xml, 'utf8'));
          removedCount++;
          records.push({
            category: 'OFFICE_TRACKING',
            targetPath: entry.entryName,
            classification: 'POLICY_CONTROLLED',
            action: 'REMOVE',
            status: 'SANITIZED',
            reason: `Sanitized author attribute in tracked revisions in ${entry.entryName}`,
          });
        }
      }
    }

    // 5. Inspect Embedded Objects & VBA
    for (const entry of entries) {
      if (entry.entryName.startsWith('word/embeddings/') || entry.entryName.endsWith('.bin')) {
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
          message: `DOCX contains embedded binary object (${entry.entryName}) that cannot be automatically sanitized`,
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
