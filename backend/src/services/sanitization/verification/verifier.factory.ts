import { PdfMetadataVerifier } from './pdf.metadata.verifier';
import { OfficeMetadataVerifier } from './office.metadata.verifier';
import { ImageMetadataVerifier } from './image.metadata.verifier';
import { FilenameMetadataVerifier } from './filename.metadata.verifier';
import { MetadataInventoryReport } from './metadata.inventory';
import { SanitizationPolicyOptions } from '../engines/base.engine';

export class IndependentMetadataVerifier {
  public static async verifyOutputArtifact(options: {
    outputPath: string;
    mimeType: string;
    extension: string;
    publishedFilename: string;
    originalFilename?: string;
    policyOptions?: SanitizationPolicyOptions;
  }): Promise<MetadataInventoryReport> {
    const ext = options.extension.toLowerCase().replace('.', '');

    let formatReport: MetadataInventoryReport;

    if (ext === 'pdf' || options.mimeType === 'application/pdf') {
      formatReport = await PdfMetadataVerifier.verify(options.outputPath, options.policyOptions);
    } else if (ext === 'docx') {
      formatReport = await OfficeMetadataVerifier.verify(options.outputPath, 'docx', options.policyOptions);
    } else if (ext === 'xlsx') {
      formatReport = await OfficeMetadataVerifier.verify(options.outputPath, 'xlsx', options.policyOptions);
    } else if (ext === 'pptx') {
      formatReport = await OfficeMetadataVerifier.verify(options.outputPath, 'pptx', options.policyOptions);
    } else if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || options.mimeType.startsWith('image/')) {
      formatReport = await ImageMetadataVerifier.verify(options.outputPath, ext, options.policyOptions);
    } else {
      formatReport = {
        isVerified: true,
        residualMetadataCount: 0,
        unsupportedCount: 0,
        items: [],
        warnings: [],
      };
    }

    const filenameReport = FilenameMetadataVerifier.verify(options.publishedFilename, options.originalFilename);

    const isVerified = formatReport.isVerified && filenameReport.isVerified;
    const residualMetadataCount = formatReport.residualMetadataCount + filenameReport.residualMetadataCount;
    const unsupportedCount = formatReport.unsupportedCount + filenameReport.unsupportedCount;
    const items = [...formatReport.items, ...filenameReport.items];
    const warnings = [...formatReport.warnings, ...filenameReport.warnings];

    return {
      isVerified,
      residualMetadataCount,
      unsupportedCount,
      items,
      warnings,
    };
  }
}
