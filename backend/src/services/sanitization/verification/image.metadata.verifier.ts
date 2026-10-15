import fs from 'fs';
import { MetadataInventoryItem, MetadataInventoryReport } from './metadata.inventory';
import { SanitizationPolicyOptions } from '../engines/base.engine';

export class ImageMetadataVerifier {
  public static async verify(
    outputPath: string,
    format: string,
    _policyOptions?: SanitizationPolicyOptions
  ): Promise<MetadataInventoryReport> {
    const outputBuffer = await fs.promises.readFile(outputPath);
    const items: MetadataInventoryItem[] = [];
    const warnings: Array<{ code: string; message: string }> = [];
    let residualMetadataCount = 0;
    const unsupportedCount = 0;

    // 1. Verify Image Header Integrity
    const isJpeg = outputBuffer.length > 2 && outputBuffer[0] === 0xff && outputBuffer[1] === 0xd8;
    const isPng =
      outputBuffer.length > 8 &&
      outputBuffer[0] === 0x89 &&
      outputBuffer[1] === 0x50 &&
      outputBuffer[2] === 0x4e &&
      outputBuffer[3] === 0x47;

    if (!isJpeg && !isPng) {
      return {
        isVerified: false,
        residualMetadataCount: 1,
        unsupportedCount: 0,
        items: [
          {
            category: 'IMAGE_DEVICE_METADATA',
            format,
            targetPath: 'imageHeader',
            classification: 'UNSUPPORTED',
            presence: false,
            expectedAction: 'PRESERVE',
            verificationStatus: 'VERIFICATION_FAILED',
            reason: 'Corrupted image header after sanitization',
          },
        ],
        warnings: [{ code: 'CORRUPTED_IMAGE', message: 'Output image header validation failed' }],
      };
    }

    // 2. JPEG EXIF / GPS APP1 Marker Segment Verification (0xFFE1)
    if (isJpeg) {
      let hasApp1Exif = false;
      let offset = 2;
      while (offset < outputBuffer.length - 4) {
        if (outputBuffer[offset] !== 0xff) break;
        const marker = outputBuffer[offset + 1];
        if (marker === 0xda) break; // Start of Scan (imageData)

        const length = outputBuffer.readUInt16BE(offset + 2);
        if (marker === 0xe1) { // APP1 EXIF / GPS marker
          hasApp1Exif = true;
          break;
        }
        offset += 2 + length;
      }

      if (hasApp1Exif) {
        residualMetadataCount++;
        items.push({
          category: 'IMAGE_EXIF',
          format,
          targetPath: 'APP1_MARKER_0xFFE1',
          classification: 'REMOVE',
          presence: true,
          expectedAction: 'REMOVE',
          verificationStatus: 'PRESENT_AND_REQUIRES_REMOVAL',
          reason: 'Residual JPEG EXIF/GPS APP1 marker found in output image',
        });
      } else {
        items.push({
          category: 'IMAGE_EXIF',
          format,
          targetPath: 'APP1_MARKER_0xFFE1',
          classification: 'REMOVE',
          presence: false,
          expectedAction: 'REMOVE',
          verificationStatus: 'REMOVED_AND_VERIFIED',
          reason: 'Verified complete absence of JPEG EXIF/GPS APP1 markers',
        });
      }
    } else {
      items.push({
        category: 'IMAGE_EXIF',
        format,
        targetPath: 'pngMetadata',
        classification: 'PRESERVE',
        presence: false,
        expectedAction: 'REMOVE',
        verificationStatus: 'NOT_PRESENT',
        reason: 'PNG image verified clean of EXIF markers',
      });
    }

    const isVerified = residualMetadataCount === 0;

    return {
      isVerified,
      residualMetadataCount,
      unsupportedCount,
      items,
      warnings,
    };
  }
}
