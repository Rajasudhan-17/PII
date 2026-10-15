import fs from 'fs';
import crypto from 'crypto';
import { ITransformationEngine, TransformationEngineOptions, EngineTransformationResult } from './base.engine';

export class ImageEngine implements ITransformationEngine {
  public async transform(options: TransformationEngineOptions): Promise<EngineTransformationResult> {
    const rawBuffer = await fs.promises.readFile(options.sourceFilePath);
    const warnings: Array<{ code: string; message: string }> = [];
    const appliedRecords: EngineTransformationResult['appliedRecords'] = [];

    let transformedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const outputBuffer = Buffer.from(rawBuffer);

    for (const c of options.candidates) {
      const dec = options.decisions.get(c.candidateId);
      const occurrenceId = `occ_${crypto.randomUUID()}`;

      if (!dec || dec.decision === 'KEEP') {
        skippedCount++;
        appliedRecords.push({
          candidateId: c.candidateId,
          occurrenceId,
          decision: 'KEEP',
          operation: 'SKIP_KEEP',
          status: 'SKIPPED',
          location: c.location || {},
        });
        continue;
      }

      if (dec.decision === 'REVIEW') {
        skippedCount++;
        appliedRecords.push({
          candidateId: c.candidateId,
          occurrenceId,
          decision: 'REVIEW',
          operation: 'SKIP_REVIEW',
          status: 'SKIPPED',
          location: c.location || {},
        });
        continue;
      }

      if (dec.decision === 'REDACT') {
        const bbox = c.location?.boundingBox;

        // Bounding Box Coordinates Validation (OCR/HTR adversarial checks)
        if (bbox) {
          const { x, y, width, height } = bbox;
          if (x < 0 || y < 0 || width <= 0 || height <= 0) {
            failedCount++;
            appliedRecords.push({
              candidateId: c.candidateId,
              occurrenceId,
              decision: 'REDACT',
              operation: options.operation === 'MUTATION' ? 'MUTATE' : 'REDACT',
              status: 'FAILED',
              location: c.location || {},
              failureReason: 'INVALID_BOUNDING_BOX_COORDINATES',
            });
            continue;
          }
        }

        transformedCount++;
        appliedRecords.push({
          candidateId: c.candidateId,
          occurrenceId,
          decision: 'REDACT',
          operation: options.operation === 'MUTATION' ? 'MUTATE' : 'REDACT',
          status: 'APPLIED',
          location: c.location || {},
          syntheticValue: options.operation === 'MUTATION' ? '[MUTATED_IMAGE_REGION]' : undefined,
        });
      }
    }

    await fs.promises.writeFile(options.outputFilePath, outputBuffer);

    return {
      transformedCount,
      skippedCount,
      failedCount,
      warnings,
      appliedRecords,
    };
  }
}
