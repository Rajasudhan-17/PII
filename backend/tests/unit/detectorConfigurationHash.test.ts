import { initializeDefaultDetectors } from '../../src/services/pii/detectors';

describe('Detector Configuration Hash Unit Tests', () => {
  it('should generate a stable deterministic SHA-256 fingerprint of registered detector configuration', () => {
    const registry = initializeDefaultDetectors();
    const hash1 = registry.getDetectorConfigurationHash();
    const hash2 = registry.getDetectorConfigurationHash();

    expect(hash1).toBeDefined();
    expect(hash1.length).toBe(64); // SHA-256 hex string length
    expect(hash1).toBe(hash2);
  });
});
