import { DetectionRunModel, DetectionRunStatus } from '../../src/models/detectionRun.model';

describe('DetectionRun State Machine & Model Unit Tests', () => {
  it('should validate allowed DetectionRun states', () => {
    const validStates: DetectionRunStatus[] = ['QUEUED', 'RUNNING', 'PARTIAL', 'COMPLETED', 'FAILED'];

    for (const status of validStates) {
      const run = new DetectionRunModel({
        detectionRunId: `run_${status}`,
        organizationId: '507f1f77bcf86cd799439011',
        documentId: '507f1f77bcf86cd799439012',
        documentChecksum: 'checksum_abc',
        detectorConfigurationHash: 'hash_xyz',
        status,
      });

      const err = run.validateSync();
      expect(err).toBeUndefined();
    }
  });

  it('should reject invalid DetectionRun status values', () => {
    const run = new DetectionRunModel({
      detectionRunId: 'run_invalid',
      organizationId: '507f1f77bcf86cd799439011',
      documentId: '507f1f77bcf86cd799439012',
      documentChecksum: 'checksum_abc',
      detectorConfigurationHash: 'hash_xyz',
      status: 'INVALID_STATUS' as unknown as DetectionRunStatus,
    });

    const err = run.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.status).toBeDefined();
  });
});
