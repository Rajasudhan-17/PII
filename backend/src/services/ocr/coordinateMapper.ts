import { BoundingBox } from '../../models/normalizedDocument.model';
import { BoundingBoxCoords } from './ocr.provider';

export interface PageDimensions {
  width: number;
  height: number;
}

export type RotationAngle = 0 | 90 | 180 | 270;

export class CoordinateMapper {
  /**
   * Transforms bounding box coordinates from rendered/rotated image pixel space back to canonical source page units.
   * Top-left origin (0,0).
   *
   * @param bbox Bounding box in rendered image pixel space { x0, y0, x1, y1 }
   * @param renderedDim Dimensions of rendered/scanned image in pixels
   * @param sourceDim Dimensions of canonical source document page (e.g. PDF points or original unrotated image dimensions)
   * @param rotation Rotation angle of the rendered image in degrees (0, 90, 180, 270)
   */
  static mapToSourcePageUnits(
    bbox: BoundingBoxCoords,
    renderedDim?: PageDimensions,
    sourceDim?: PageDimensions,
    rotation: RotationAngle = 0
  ): BoundingBox {
    let x0 = bbox.x0;
    let y0 = bbox.y0;
    let x1 = bbox.x1;
    let y1 = bbox.y1;

    const imgW = renderedDim ? renderedDim.width : 0;
    const imgH = renderedDim ? renderedDim.height : 0;

    // Apply inverse rotation if page image was rotated relative to canonical source orientation
    if (renderedDim && imgW > 0 && imgH > 0) {
      if (rotation === 90) {
        // 90 degrees clockwise rotation inverse mapping
        const newX0 = y0;
        const newY0 = imgW - x1;
        const newX1 = y1;
        const newY1 = imgW - x0;
        x0 = newX0;
        y0 = newY0;
        x1 = newX1;
        y1 = newY1;
      } else if (rotation === 180) {
        // 180 degrees rotation inverse mapping
        const newX0 = imgW - x1;
        const newY0 = imgH - y1;
        const newX1 = imgW - x0;
        const newY1 = imgH - y0;
        x0 = newX0;
        y0 = newY0;
        x1 = newX1;
        y1 = newY1;
      } else if (rotation === 270) {
        // 270 degrees clockwise rotation inverse mapping
        const newX0 = imgH - y1;
        const newY0 = x0;
        const newX1 = imgH - y0;
        const newY1 = x1;
        x0 = newX0;
        y0 = newY0;
        x1 = newX1;
        y1 = newY1;
      }
    }

    let scaleX = 1;
    let scaleY = 1;

    if (
      renderedDim &&
      sourceDim &&
      renderedDim.width > 0 &&
      renderedDim.height > 0 &&
      sourceDim.width > 0 &&
      sourceDim.height > 0
    ) {
      // Determine target effective width and height after un-rotating
      const targetRenderedWidth = rotation === 90 || rotation === 270 ? renderedDim.height : renderedDim.width;
      const targetRenderedHeight = rotation === 90 || rotation === 270 ? renderedDim.width : renderedDim.height;

      scaleX = sourceDim.width / targetRenderedWidth;
      scaleY = sourceDim.height / targetRenderedHeight;
    }

    const minX = Math.min(x0, x1);
    const minY = Math.min(y0, y1);
    const maxX = Math.max(x0, x1);
    const maxY = Math.max(y0, y1);

    const x = Math.round(Math.max(0, minX * scaleX) * 100) / 100;
    const y = Math.round(Math.max(0, minY * scaleY) * 100) / 100;
    const width = Math.round(Math.max(0, (maxX - minX) * scaleX) * 100) / 100;
    const height = Math.round(Math.max(0, (maxY - minY) * scaleY) * 100) / 100;

    return { x, y, width, height };
  }
}
