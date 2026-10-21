import fs from 'fs';
import crypto from 'crypto';
import { PNG } from 'pngjs';
import { ITransformationEngine, TransformationEngineOptions, EngineTransformationResult } from './base.engine';

export class ImageEngine implements ITransformationEngine {
  public async transform(options: TransformationEngineOptions): Promise<EngineTransformationResult> {
    const rawBuffer = await fs.promises.readFile(options.sourceFilePath);
    const warnings: Array<{ code: string; message: string }> = [];
    const appliedRecords: EngineTransformationResult['appliedRecords'] = [];

    let transformedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    let outputBuffer = Buffer.from(rawBuffer);

    // Identify if source is a PNG image
    const isPng =
      rawBuffer.length > 8 &&
      rawBuffer[0] === 0x89 &&
      rawBuffer[1] === 0x50 &&
      rawBuffer[2] === 0x4e &&
      rawBuffer[3] === 0x47;

    let pngInstance: PNG | null = null;
    if (isPng) {
      try {
        pngInstance = PNG.sync.read(rawBuffer);
      } catch {
        pngInstance = null;
      }
    }

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

          // Physically destroy pixel values in the candidate bounding box region
          if (pngInstance) {
            const startX = Math.max(0, Math.floor(bbox.x));
            const startY = Math.max(0, Math.floor(bbox.y));
            const endX = Math.min(pngInstance.width, Math.floor(bbox.x + bbox.width));
            const endY = Math.min(pngInstance.height, Math.floor(bbox.y + bbox.height));

            for (let py = startY; py < endY; py++) {
              for (let px = startX; px < endX; px++) {
                const idx = (pngInstance.width * py + px) << 2;
                pngInstance.data[idx] = 0; // Red = 0 (Black)
                pngInstance.data[idx + 1] = 0; // Green = 0 (Black)
                pngInstance.data[idx + 2] = 0; // Blue = 0 (Black)
                pngInstance.data[idx + 3] = 255; // Alpha = 255 (Fully opaque)
              }
            }
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

    if (pngInstance && transformedCount > 0) {
      outputBuffer = Buffer.from(PNG.sync.write(pngInstance));
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
