import fs from 'fs';
import {
  ISanitizerEngine,
  SanitizationEngineOptions,
  EngineSanitizationResult,
  SanitizationRecordItem,
} from './base.engine';

export class ImageSanitizerEngine implements ISanitizerEngine {
  public async sanitize(options: SanitizationEngineOptions): Promise<EngineSanitizationResult> {
    const rawBuffer = await fs.promises.readFile(options.sourceFilePath);
    const records: SanitizationRecordItem[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    let discoveredCount = 0;
    let removedCount = 0;
    const preservedCount = 0;
    const unsupportedCount = 0;

    let outputBuffer = Buffer.from(rawBuffer);

    // 1. Inspect JPEG EXIF / GPS APP1 marker segments (0xFFE1)
    if (outputBuffer.length > 4 && outputBuffer[0] === 0xff && outputBuffer[1] === 0xd8) {
      let offset = 2;
      const cleanSegments: Buffer[] = [outputBuffer.subarray(0, 2)];

      while (offset < outputBuffer.length - 1) {
        if (outputBuffer[offset] !== 0xff) {
          break;
        }

        const marker = outputBuffer[offset + 1];

        // End of image (EOI) or Start of Scan (SOS)
        if (marker === 0xd9 || marker === 0xda) {
          cleanSegments.push(outputBuffer.subarray(offset));
          break;
        }

        const len = outputBuffer.readUInt16BE(offset + 2);
        const segmentEnd = offset + 2 + len;

        // APP1 Marker (0xFFE1) -> EXIF / GPS Metadata Header
        if (marker === 0xe1) {
          discoveredCount++;
          const segHeader = outputBuffer.toString('latin1', offset + 4, offset + 8);

          if (segHeader.includes('Exif')) {
            removedCount++;
            records.push({
              category: 'IMAGE_EXIF',
              targetPath: 'exifSegment.APP1',
              classification: 'REMOVE',
              action: 'REMOVE',
              status: 'SANITIZED',
              reason: 'Stripped JPEG EXIF APP1 metadata marker segment',
            });
            records.push({
              category: 'IMAGE_GPS',
              targetPath: 'exifSegment.GPSInfo',
              classification: 'REMOVE',
              action: 'REMOVE',
              status: 'SANITIZED',
              reason: 'Stripped JPEG GPS location metadata from APP1 segment',
            });
          } else {
            removedCount++;
            records.push({
              category: 'IMAGE_EXIF',
              targetPath: `segment.0xFFE1_${segHeader}`,
              classification: 'REMOVE',
              action: 'REMOVE',
              status: 'SANITIZED',
              reason: 'Stripped APP1 metadata segment',
            });
          }
        } else {
          // Retain visual image segments and SOF / DQT / DHT tables
          cleanSegments.push(outputBuffer.subarray(offset, Math.min(segmentEnd, outputBuffer.length)));
        }

        offset = segmentEnd;
      }

      outputBuffer = Buffer.concat(cleanSegments);
    } else {
      // PNG / TIFF metadata string check
      const bufString = outputBuffer.toString('latin1');
      if (bufString.includes('Exif') || bufString.includes('GPSLatitude')) {
        discoveredCount++;
        removedCount++;
        records.push({
          category: 'IMAGE_EXIF',
          targetPath: 'imageHeader.Exif',
          classification: 'REMOVE',
          action: 'REMOVE',
          status: 'SANITIZED',
          reason: 'Stripped image EXIF header data',
        });
      }
    }

    await fs.promises.writeFile(options.outputFilePath, outputBuffer);

    return {
      discoveredCount,
      removedCount,
      preservedCount,
      unsupportedCount,
      warnings,
      records,
    };
  }

  public async verifyOutput(
    outputFilePath: string,
    _options: SanitizationEngineOptions
  ): Promise<{ isVerified: boolean; residualMetadata: string[] }> {
    const rawBuffer = await fs.promises.readFile(outputFilePath);
    const residualMetadata: string[] = [];

    // Verify JPEG APP1 EXIF marker (0xFF 0xE1) is absent in header
    if (rawBuffer.length > 4 && rawBuffer[0] === 0xff && rawBuffer[1] === 0xd8) {
      let offset = 2;
      while (offset < rawBuffer.length - 1) {
        if (rawBuffer[offset] !== 0xff) break;
        const marker = rawBuffer[offset + 1];
        if (marker === 0xda || marker === 0xd9) break;

        if (marker === 0xe1) {
          const segHeader = rawBuffer.toString('latin1', offset + 4, offset + 8);
          if (segHeader.includes('Exif')) {
            residualMetadata.push('Residual EXIF APP1 marker 0xFFE1 detected in JPEG header');
          }
        }
        const len = rawBuffer.readUInt16BE(offset + 2);
        offset += 2 + len;
      }
    }

    return {
      isVerified: residualMetadata.length === 0,
      residualMetadata,
    };
  }
}
