import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ChecksumVerifier } from '../../src/services/verification/verifiers/checksumVerifier';
import { ArtifactIntegrityVerifier } from '../../src/services/verification/verifiers/artifactIntegrityVerifier';
import { StructuralIntegrityVerifier } from '../../src/services/verification/verifiers/structuralIntegrityVerifier';
import { TransformationVerifier } from '../../src/services/verification/verifiers/transformationVerifier';
import { MetadataVerifier } from '../../src/services/verification/verifiers/metadataVerifier';
import { PiiResidualVerifier } from '../../src/services/verification/verifiers/piiResidualVerifier';
import { PolicyVerifier } from '../../src/services/verification/verifiers/policyVerifier';
import { ProvenanceVerifier } from '../../src/services/verification/verifiers/provenanceVerifier';
import { RiskConsistencyVerifier } from '../../src/services/verification/verifiers/riskConsistencyVerifier';

describe('Phase 13 Independent Verifiers Unit Tests', () => {
  const scratchDir = path.join(process.cwd(), 'scratch', 'test_verifiers');
  let srcFile: string;
  let outFile: string;
  let srcChecksum: string;
  let outChecksum: string;

  beforeAll(async () => {
    await fs.promises.mkdir(scratchDir, { recursive: true });
    srcFile = path.join(scratchDir, 'source.pdf');
    outFile = path.join(scratchDir, 'output.pdf');

    const srcContent = '%PDF-1.4 1 0 obj << /Author (Original) >> stream (Content) endstream endobj %%EOF';
    const outContent = '%PDF-1.4 1 0 obj << /Author (Sanitized) >> stream ([REDACTED]) endstream endobj %%EOF';

    await fs.promises.writeFile(srcFile, srcContent, 'binary');
    await fs.promises.writeFile(outFile, outContent, 'binary');

    srcChecksum = crypto.createHash('sha256').update(Buffer.from(srcContent, 'binary')).digest('hex');
    outChecksum = crypto.createHash('sha256').update(Buffer.from(outContent, 'binary')).digest('hex');
  });

  afterAll(async () => {
    await fs.promises.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  });

  test('ChecksumVerifier detects matching SHA-256 hashes cleanly', async () => {
    const res = await ChecksumVerifier.verify(srcFile, outFile, srcChecksum, outChecksum);
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });

  test('ChecksumVerifier flags failure when output checksum is tampered', async () => {
    const res = await ChecksumVerifier.verify(srcFile, outFile, srcChecksum, 'bad_checksum_hash');
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAILED');
    expect(res.reasonCode).toBe('OUTPUT_CHECKSUM_MISMATCH');
  });

  test('ArtifactIntegrityVerifier checks tenant ownership boundaries and active state', () => {
    const valid = ArtifactIntegrityVerifier.verify({
      docOrgId: 'org_123',
      targetOrgId: 'org_123',
      docIsDeleted: false,
      sourceArtifactId: 'src_1',
      outputArtifactId: 'out_1',
    });
    expect(valid.passed).toBe(true);

    const crossTenant = ArtifactIntegrityVerifier.verify({
      docOrgId: 'org_123',
      targetOrgId: 'org_999',
      docIsDeleted: false,
      sourceArtifactId: 'src_1',
      outputArtifactId: 'out_1',
    });
    expect(crossTenant.passed).toBe(false);
    expect(crossTenant.reasonCode).toBe('TENANT_MISMATCH');
  });

  test('StructuralIntegrityVerifier validates PDF header magic bytes', async () => {
    const res = await StructuralIntegrityVerifier.verify(outFile, 'pdf');
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });

  test('TransformationVerifier checks operation mutated output file when REDACT is specified', () => {
    const res = TransformationVerifier.verify({
      transformationRunExists: true,
      operationType: 'REDACT',
      sourceChecksum: srcChecksum,
      outputChecksum: outChecksum,
    });
    expect(res.passed).toBe(true);
  });

  test('MetadataVerifier returns NOT_VERIFIABLE for unsupported file extension', async () => {
    const res = await MetadataVerifier.verify(outFile, 'xyz', true);
    expect(res.status).toBe('NOT_VERIFIABLE');
    expect(res.reasonCode).toBe('UNSUPPORTED_METADATA_FORMAT');
  });

  test('PiiResidualVerifier detects residual sensitive candidate text in output stream', async () => {
    const cleanRes = await PiiResidualVerifier.verify(outFile, 'REDACT', ['John Doe']);
    expect(cleanRes.passed).toBe(true);

    // Create file containing residual sensitive text
    const residualFile = path.join(scratchDir, 'residual.pdf');
    await fs.promises.writeFile(residualFile, '%PDF-1.4 John Doe', 'binary');

    const failRes = await PiiResidualVerifier.verify(residualFile, 'REDACT', ['John Doe']);
    expect(failRes.passed).toBe(false);
    expect(failRes.status).toBe('FAILED');
    expect(failRes.reasonCode).toBe('RESIDUAL_DIRECT_IDENTIFIER_OBSERVED');
  });

  test('PolicyVerifier ensures REDACT decision alters output checksum', () => {
    const passRes = PolicyVerifier.verify('REDACT', srcChecksum, outChecksum);
    expect(passRes.passed).toBe(true);

    const failRes = PolicyVerifier.verify('REDACT', srcChecksum, srcChecksum);
    expect(failRes.passed).toBe(false);
    expect(failRes.reasonCode).toBe('POLICY_DECISION_UNSATISFIED');
  });

  test('RiskConsistencyVerifier flags inconsistency when LOW risk has residual direct identifier', () => {
    const passRes = RiskConsistencyVerifier.verify('LOW', false);
    expect(passRes.passed).toBe(true);

    const failRes = RiskConsistencyVerifier.verify('LOW', true);
    expect(failRes.passed).toBe(false);
    expect(failRes.reasonCode).toBe('RISK_LEVEL_INCONSISTENCY');
  });

  test('ProvenanceVerifier reconciles candidate, decision, and risk chain references', () => {
    const res = ProvenanceVerifier.verify({
      hasCandidateChain: true,
      hasDecisionChain: true,
      hasRiskChain: true,
      documentId: 'doc_123',
      organizationId: 'org_123',
    });
    expect(res.passed).toBe(true);
    expect(res.status).toBe('VERIFIED');
  });
});
