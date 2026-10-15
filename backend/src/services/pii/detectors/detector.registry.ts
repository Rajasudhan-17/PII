import crypto from 'crypto';
import { IPIIDetector, RawDetectedCandidate, DetectionContext } from './detector.interface';
import { logger } from '../../../utils/logger';

export class PIIDetectorRegistry {
  private static instance: PIIDetectorRegistry;
  private detectors: Map<string, IPIIDetector> = new Map();

  private constructor() {}

  public static getInstance(): PIIDetectorRegistry {
    if (!PIIDetectorRegistry.instance) {
      PIIDetectorRegistry.instance = new PIIDetectorRegistry();
    }
    return PIIDetectorRegistry.instance;
  }

  public register(detector: IPIIDetector): void {
    if (this.detectors.has(detector.name)) {
      logger.warn(`Detector ${detector.name} already registered. Overwriting.`);
    }
    this.detectors.set(detector.name, detector);
    logger.info(`Registered PII detector: ${detector.name} v${detector.version} [${detector.type}]`);
  }

  public getDetector(name: string): IPIIDetector | undefined {
    return this.detectors.get(name);
  }

  public getAllDetectors(): IPIIDetector[] {
    return Array.from(this.detectors.values());
  }

  public getDetectorConfigurationHash(): string {
    const sortedDetectors = this.getAllDetectors().sort((a, b) => a.name.localeCompare(b.name));
    const configRepresentation = sortedDetectors.map((d) => ({
      name: d.name,
      version: d.version,
      type: d.type,
      supportedTypes: d.supportedTypes.sort(),
    }));

    const jsonStr = JSON.stringify(configRepresentation);
    return crypto.createHash('sha256').update(jsonStr).digest('hex');
  }

  public async runAll(
    text: string,
    context: DetectionContext
  ): Promise<{ candidates: RawDetectedCandidate[]; warnings: Array<{ code: string; message: string }> }> {
    const candidates: RawDetectedCandidate[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    for (const detector of this.detectors.values()) {
      try {
        const results = await detector.detect(text, context);
        candidates.push(...results);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Detector ${detector.name} execution failed: ${msg}`);
        warnings.push({
          code: 'DETECTOR_FAILED',
          message: `Detector ${detector.name} failed: ${msg}`,
        });
      }
    }

    return { candidates, warnings };
  }

  public clear(): void {
    this.detectors.clear();
  }
}
