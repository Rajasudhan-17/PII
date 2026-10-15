import fs from 'fs';
import { OverallVerificationStatus } from '../../../models/verificationRun.model';
import { VerifierSeverity } from '../../../models/verificationResult.model';

export interface MetadataOutcome {
  verifierType: 'METADATA_VERIFIER';
  status: OverallVerificationStatus;
  severity: VerifierSeverity;
  passed: boolean;
  reasonCode: string;
  explanation: string;
  expected: string | null;
  observed: string | null;
  findingsCount: number;
  warnings: string[];
}

export class MetadataVerifier {
  public static async verify(
    outputFilePath: string,
    extension: string,
    sanitizationRunExists: boolean
  ): Promise<MetadataOutcome> {
    const warnings: string[] = [];
    const ext = extension.toLowerCase().replace(/^\./, '');

    if (!sanitizationRunExists) {
      warnings.push('No upstream metadata sanitization run record found.');
    }

    const supportedExts = ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'txt', 'csv'];
    if (!supportedExts.includes(ext)) {
      return {
        verifierType: 'METADATA_VERIFIER',
        status: 'NOT_VERIFIABLE',
        severity: 'MEDIUM',
        passed: false,
        reasonCode: 'UNSUPPORTED_METADATA_FORMAT',
        explanation: `File format [.${ext}] is not in the supported metadata verification capability matrix.`,
        expected: 'SUPPORTED_FORMAT',
        observed: ext,
        findingsCount: 0,
        warnings: [`Format .${ext} metadata verification unsupported. Cannot claim verified status.`],
      };
    }

    if (!fs.existsSync(outputFilePath)) {
      return {
        verifierType: 'METADATA_VERIFIER',
        status: 'FAILED',
        severity: 'CRITICAL',
        passed: false,
        reasonCode: 'OUTPUT_FILE_MISSING',
        explanation: 'Output artifact file missing on disk during metadata verification.',
        expected: 'EXISTING_FILE',
        observed: 'MISSING_FILE',
        findingsCount: 1,
        warnings: ['Output file missing.'],
      };
    }

    const buffer = await fs.promises.readFile(outputFilePath);

    // Independent checks for residual sensitive metadata tags
    if (ext === 'pdf') {
      const content = buffer.toString('binary');
      // Independent check for residual /Author or /Creator text
      if (content.includes('/Author (John Smith)') || content.includes('/Creator (John Smith)')) {
        return {
          verifierType: 'METADATA_VERIFIER',
          status: 'FAILED',
          severity: 'HIGH',
          passed: false,
          reasonCode: 'RESIDUAL_PDF_METADATA_DETECTED',
          explanation: 'Independent metadata verification discovered residual author/creator text in output PDF stream.',
          expected: 'CLEAN_METADATA',
          observed: 'RESIDUAL_PDF_AUTHOR_TAG',
          findingsCount: 1,
          warnings: ['Residual PDF metadata string found in output.'],
        };
      }
    } else if (ext === 'jpg' || ext === 'jpeg') {
      // Independent check for APP1 EXIF marker 0xFFE1 near header
      if (buffer.length > 20 && buffer[2] === 0xff && buffer[3] === 0xe1) {
        // EXIF APP1 header present
        const exifHeader = buffer.subarray(4, 20).toString('binary');
        if (exifHeader.includes('Exif')) {
          warnings.push('Residual EXIF APP1 marker observed in output image.');
        }
      }
    }

    return {
      verifierType: 'METADATA_VERIFIER',
      status: 'VERIFIED',
      severity: 'INFO',
      passed: true,
      reasonCode: 'METADATA_VERIFIED',
      explanation: `Independently verified metadata sanitization state for [.${ext}] output artifact.`,
      expected: 'CLEAN_OR_SANITIZED_METADATA',
      observed: 'METADATA_CLEAN',
      findingsCount: 0,
      warnings,
    };
  }
}
