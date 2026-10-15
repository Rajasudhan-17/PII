import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { OverallVerificationStatus } from '../../../models/verificationRun.model';
import { VerifierSeverity } from '../../../models/verificationResult.model';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

export interface PiiResidualOutcome {
  verifierType: 'PII_RESIDUAL_VERIFIER';
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

export class PiiResidualVerifier {
  public static readonly MAX_EXTRACTED_TEXT_BYTES = 1024 * 1024; // 1MB Limit

  public static async verify(
    outputFilePath: string,
    decisionType: string | null,
    sensitiveCandidatesText: string[],
    fileExtension?: string
  ): Promise<PiiResidualOutcome> {
    const warnings: string[] = [];

    if (!fs.existsSync(outputFilePath)) {
      return {
        verifierType: 'PII_RESIDUAL_VERIFIER',
        status: 'FAILED',
        severity: 'CRITICAL',
        passed: false,
        reasonCode: 'OUTPUT_FILE_MISSING',
        explanation: 'Output artifact missing during residual PII verification.',
        expected: 'EXISTING_FILE',
        observed: 'MISSING_FILE',
        findingsCount: 1,
        warnings: ['Output file missing.'],
      };
    }

    const ext = (fileExtension || path.extname(outputFilePath).replace('.', '')).toLowerCase();
    const supportedFormats = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg'];

    if (!supportedFormats.includes(ext)) {
      return {
        verifierType: 'PII_RESIDUAL_VERIFIER',
        status: 'NOT_VERIFIABLE',
        severity: 'MEDIUM',
        passed: true,
        reasonCode: 'UNSUPPORTED_REPRESENTATION_FORMAT',
        explanation: `Representation-aware residual verification is not supported for extension .${ext}`,
        expected: 'SUPPORTED_FORMAT',
        observed: `UNSUPPORTED_FORMAT_${ext.toUpperCase()}`,
        findingsCount: 0,
        warnings: [`Extension .${ext} does not have a representation-aware text extractor for residual verification.`],
      };
    }

    if (decisionType === 'REDACT' && sensitiveCandidatesText.length > 0) {
      let extractedTextContent = '';

      try {
        if (ext === 'pdf') {
          const buffer = await fs.promises.readFile(outputFilePath);
          try {
            const parsed = await pdfParse(buffer);
            extractedTextContent = (parsed.text || '') + ' ' + buffer.toString('binary');
          } catch {
            extractedTextContent = buffer.toString('binary');
          }
        } else if (['docx', 'xlsx', 'pptx'].includes(ext)) {
          const zip = new AdmZip(outputFilePath);
          const zipEntries = zip.getEntries();
          const targetXmls: string[] = [];

          for (const entry of zipEntries) {
            const entryName = entry.entryName.toLowerCase();
            if (
              (ext === 'docx' &&
                (entryName.includes('word/document.xml') ||
                  entryName.includes('word/header') ||
                  entryName.includes('word/footer') ||
                  entryName.includes('word/footnotes') ||
                  entryName.includes('word/endnotes'))) ||
              (ext === 'xlsx' &&
                (entryName.includes('xl/sharedstrings.xml') ||
                  entryName.includes('xl/worksheets/') ||
                  entryName.includes('xl/comments'))) ||
              (ext === 'pptx' &&
                (entryName.includes('ppt/slides/') ||
                  entryName.includes('ppt/notesslides/') ||
                  entryName.includes('ppt/slidemasters/')))
            ) {
              targetXmls.push(entry.getData().toString('utf8'));
            }
          }
          extractedTextContent = targetXmls.join(' ');
        } else if (['txt', 'csv'].includes(ext)) {
          const buffer = await fs.promises.readFile(outputFilePath);
          extractedTextContent = buffer.toString('utf8');
        } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
          const buffer = await fs.promises.readFile(outputFilePath);
          extractedTextContent = buffer.toString('binary');
        }
      } catch (err) {
        return {
          verifierType: 'PII_RESIDUAL_VERIFIER',
          status: 'FAILED',
          severity: 'HIGH',
          passed: false,
          reasonCode: 'REPRESENTATION_EXTRACTION_FAILED',
          explanation: `Failed to extract format-specific text representation for .${ext}: ${(err as Error).message}`,
          expected: 'PARSABLE_REPRESENTATION',
          observed: 'EXTRACTION_ERROR',
          findingsCount: 1,
          warnings: [`Representation extraction failed for .${ext}`],
        };
      }

      // Enforce 1MB Extracted Text Resource Bound
      if (extractedTextContent.length > PiiResidualVerifier.MAX_EXTRACTED_TEXT_BYTES) {
        extractedTextContent = extractedTextContent.substring(0, PiiResidualVerifier.MAX_EXTRACTED_TEXT_BYTES);
        warnings.push('Extracted text representation exceeded 1MB limit and was safely bounded.');
      }

      for (const sensitiveText of sensitiveCandidatesText) {
        if (sensitiveText && sensitiveText.length >= 3 && extractedTextContent.includes(sensitiveText)) {
          return {
            verifierType: 'PII_RESIDUAL_VERIFIER',
            status: 'FAILED',
            severity: 'CRITICAL',
            passed: false,
            reasonCode: 'RESIDUAL_DIRECT_IDENTIFIER_OBSERVED',
            explanation: `Independent representation-aware verification detected residual sensitive text in .${ext} artifact (KNOWN_CANDIDATE_RESIDUAL_VERIFICATION scope).`,
            expected: 'REDACTED_CONTENT',
            observed: 'RESIDUAL_TEXT_OBSERVED',
            findingsCount: 1,
            warnings: ['Known prohibited content survived transformation in document representation.'],
          };
        }
      }
    }

    return {
      verifierType: 'PII_RESIDUAL_VERIFIER',
      status: 'VERIFIED',
      severity: 'INFO',
      passed: true,
      reasonCode: 'PII_RESIDUAL_VERIFIED',
      explanation: 'Independently verified representation-aware residual privacy state (KNOWN_CANDIDATE_RESIDUAL_VERIFICATION scope). Output satisfies decision contract.',
      expected: decisionType || 'REDACT_OR_KEEP',
      observed: 'RESIDUAL_CLEAN',
      findingsCount: 0,
      warnings,
    };
  }
}
