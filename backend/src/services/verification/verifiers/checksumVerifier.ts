import fs from 'fs';
import crypto from 'crypto';
import { OverallVerificationStatus } from '../../../models/verificationRun.model';
import { VerifierSeverity } from '../../../models/verificationResult.model';

export interface VerifierOutcome {
  verifierType: 'CHECKSUM_VERIFIER';
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

export class ChecksumVerifier {
  public static async verify(
    sourceFilePath: string,
    outputFilePath: string,
    expectedSourceChecksum: string,
    expectedOutputChecksum: string
  ): Promise<VerifierOutcome> {
    const warnings: string[] = [];

    if (!fs.existsSync(sourceFilePath)) {
      return {
        verifierType: 'CHECKSUM_VERIFIER',
        status: 'FAILED',
        severity: 'CRITICAL',
        passed: false,
        reasonCode: 'SOURCE_FILE_NOT_FOUND',
        explanation: 'Source storage artifact file missing on disk during checksum verification.',
        expected: expectedSourceChecksum,
        observed: null,
        findingsCount: 1,
        warnings: ['Source file missing on storage disk.'],
      };
    }

    if (!fs.existsSync(outputFilePath)) {
      return {
        verifierType: 'CHECKSUM_VERIFIER',
        status: 'FAILED',
        severity: 'CRITICAL',
        passed: false,
        reasonCode: 'OUTPUT_FILE_NOT_FOUND',
        explanation: 'Transformed output artifact file missing on disk during checksum verification.',
        expected: expectedOutputChecksum,
        observed: null,
        findingsCount: 1,
        warnings: ['Output file missing on storage disk.'],
      };
    }

    // Independently calculate SHA-256 hashes
    const sourceBuffer = await fs.promises.readFile(sourceFilePath);
    const actualSourceChecksum = crypto.createHash('sha256').update(sourceBuffer).digest('hex');

    const outputBuffer = await fs.promises.readFile(outputFilePath);
    const actualOutputChecksum = crypto.createHash('sha256').update(outputBuffer).digest('hex');

    if (actualSourceChecksum !== expectedSourceChecksum) {
      return {
        verifierType: 'CHECKSUM_VERIFIER',
        status: 'FAILED',
        severity: 'CRITICAL',
        passed: false,
        reasonCode: 'SOURCE_CHECKSUM_MISMATCH',
        explanation: 'Source artifact file was altered upstream after ingestion.',
        expected: expectedSourceChecksum,
        observed: actualSourceChecksum,
        findingsCount: 1,
        warnings: ['Immutable source artifact checksum verification failed.'],
      };
    }

    if (actualOutputChecksum !== expectedOutputChecksum) {
      return {
        verifierType: 'CHECKSUM_VERIFIER',
        status: 'FAILED',
        severity: 'CRITICAL',
        passed: false,
        reasonCode: 'OUTPUT_CHECKSUM_MISMATCH',
        explanation: 'Transformed output artifact file checksum does not match expected output artifact checksum.',
        expected: expectedOutputChecksum,
        observed: actualOutputChecksum,
        findingsCount: 1,
        warnings: ['Output artifact checksum verification failed.'],
      };
    }

    return {
      verifierType: 'CHECKSUM_VERIFIER',
      status: 'VERIFIED',
      severity: 'INFO',
      passed: true,
      reasonCode: 'CHECKSUM_VERIFIED',
      explanation: 'Independently verified SHA-256 checksums match expected records for source and output artifacts.',
      expected: expectedOutputChecksum,
      observed: actualOutputChecksum,
      findingsCount: 0,
      warnings,
    };
  }
}
