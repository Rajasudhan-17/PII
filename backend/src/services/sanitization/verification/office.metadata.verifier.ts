import AdmZip from 'adm-zip';
import { MetadataInventoryItem, MetadataInventoryReport } from './metadata.inventory';
import { SanitizationPolicyOptions } from '../engines/base.engine';

export class OfficeMetadataVerifier {
  public static async verify(
    outputPath: string,
    format: 'docx' | 'xlsx' | 'pptx',
    _policyOptions?: SanitizationPolicyOptions
  ): Promise<MetadataInventoryReport> {
    const zip = new AdmZip(outputPath);
    const items: MetadataInventoryItem[] = [];
    const warnings: Array<{ code: string; message: string }> = [];
    let residualMetadataCount = 0;
    let unsupportedCount = 0;

    // 1. Core Properties Inspection
    const coreEntry = zip.getEntry('docProps/core.xml');
    if (coreEntry) {
      const coreXml = coreEntry.getData().toString('utf-8');
      const hasUnsanitizedCreator =
        /<dc:creator>(?!Sanitized)[^<]+<\/dc:creator>/.test(coreXml) ||
        /<cp:lastModifiedBy>(?!Sanitized)[^<]+<\/cp:lastModifiedBy>/.test(coreXml);

      if (hasUnsanitizedCreator) {
        residualMetadataCount++;
        items.push({
          category: 'OFFICE_CORE_PROPERTIES',
          format,
          targetPath: 'docProps/core.xml',
          classification: 'POLICY_CONTROLLED',
          presence: true,
          expectedAction: 'REMOVE',
          verificationStatus: 'PRESENT_AND_REQUIRES_REMOVAL',
          reason: 'Unsanitized author/modifier metadata found in core.xml',
        });
      } else {
        items.push({
          category: 'OFFICE_CORE_PROPERTIES',
          format,
          targetPath: 'docProps/core.xml',
          classification: 'POLICY_CONTROLLED',
          presence: false,
          expectedAction: 'REMOVE',
          verificationStatus: 'REMOVED_AND_VERIFIED',
          reason: 'Verified core properties sanitization',
        });
      }
    }

    // 2. Custom Properties Inspection
    const customEntry = zip.getEntry('docProps/custom.xml');
    if (customEntry) {
      const customXml = customEntry.getData().toString('utf-8');
      if (/<property[^>]+name="([^"]+)"/.test(customXml)) {
        residualMetadataCount++;
        items.push({
          category: 'OFFICE_CUSTOM_PROPERTIES',
          format,
          targetPath: 'docProps/custom.xml',
          classification: 'POLICY_CONTROLLED',
          presence: true,
          expectedAction: 'REMOVE',
          verificationStatus: 'PRESENT_AND_REQUIRES_REMOVAL',
          reason: 'Custom document properties remain in custom.xml',
        });
      }
    }

    // 3. Format Specific Inspections
    const entries = zip.getEntries();
    if (format === 'docx') {
      // DOCX Comments
      const commentsEntry = zip.getEntry('word/comments.xml');
      if (commentsEntry) {
        const commentsXml = commentsEntry.getData().toString('utf-8');
        if (/<w:comment\b/.test(commentsXml)) {
          residualMetadataCount++;
          items.push({
            category: 'OFFICE_COMMENTS',
            format,
            targetPath: 'word/comments.xml',
            classification: 'REMOVE',
            presence: true,
            expectedAction: 'REMOVE',
            verificationStatus: 'PRESENT_AND_REQUIRES_REMOVAL',
            reason: 'Residual Word comments present',
          });
        }
      }

      // DOCX Tracked Revisions Author Attributes
      const docEntry = zip.getEntry('word/document.xml');
      if (docEntry) {
        const docXml = docEntry.getData().toString('utf-8');
        if (/w:author="(?!Sanitized)[^"]+"/.test(docXml)) {
          residualMetadataCount++;
          items.push({
            category: 'OFFICE_TRACKING',
            format,
            targetPath: 'word/document.xml',
            classification: 'REMOVE',
            presence: true,
            expectedAction: 'REMOVE',
            verificationStatus: 'PRESENT_AND_REQUIRES_REMOVAL',
            reason: 'Unsanitized revision author names found in document.xml',
          });
        }
      }
    } else if (format === 'xlsx') {
      // XLSX Cell Comments
      const commentEntries = entries.filter((e) => e.entryName.startsWith('xl/comments'));
      if (commentEntries.length > 0) {
        residualMetadataCount++;
        items.push({
          category: 'OFFICE_COMMENTS',
          format,
          targetPath: 'xl/comments*.xml',
          classification: 'REMOVE',
          presence: true,
          expectedAction: 'REMOVE',
          verificationStatus: 'PRESENT_AND_REQUIRES_REMOVAL',
          reason: 'Residual Excel comments present',
        });
      }

      // XLSX Hidden / VeryHidden sheets state
      const workbookEntry = zip.getEntry('xl/workbook.xml');
      if (workbookEntry) {
        const wbXml = workbookEntry.getData().toString('utf-8');
        if (/state="(hidden|veryHidden)"/.test(wbXml)) {
          items.push({
            category: 'SPREADSHEET_HIDDEN_CONTENT',
            format,
            targetPath: 'xl/workbook.xml',
            classification: 'POLICY_CONTROLLED',
            presence: true,
            expectedAction: 'PRESERVE',
            verificationStatus: 'PRESENT_AND_ALLOWED',
            reason: 'Verified hidden sheet presence is classified and preserved by policy',
          });
        }
      }
    } else if (format === 'pptx') {
      // PPTX Speaker Notes
      const noteEntries = entries.filter((e) => e.entryName.startsWith('ppt/notesSlides/notesSlide'));
      for (const noteEntry of noteEntries) {
        const noteXml = noteEntry.getData().toString('utf-8');
        if (/<a:t>(?!\[Sanitized Speaker Note\])[^<]+<\/a:t>/.test(noteXml)) {
          residualMetadataCount++;
          items.push({
            category: 'PRESENTATION_NOTES',
            format,
            targetPath: noteEntry.entryName,
            classification: 'REMOVE',
            presence: true,
            expectedAction: 'REMOVE',
            verificationStatus: 'PRESENT_AND_REQUIRES_REMOVAL',
            reason: 'Unsanitized PowerPoint speaker note text found',
          });
        }
      }
    }

    // 4. Embedded Binary Inspection
    const embedEntries = entries.filter(
      (e) =>
        e.entryName.includes('embeddings/') ||
        e.entryName.endsWith('.bin') ||
        e.entryName.endsWith('.ole')
    );
    if (embedEntries.length > 0) {
      unsupportedCount++;
      warnings.push({
        code: 'UNSUPPORTED_EMBEDDED_OBJECT',
        message: `${embedEntries.length} embedded binary object(s) present in Office package`,
      });
      items.push({
        category: 'OFFICE_EMBEDDED_OBJECT',
        format,
        targetPath: 'embeddings/',
        classification: 'UNSUPPORTED',
        presence: true,
        expectedAction: 'REMOVE',
        verificationStatus: 'UNSUPPORTED',
        reason: 'Embedded binary OLE containers detected',
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
