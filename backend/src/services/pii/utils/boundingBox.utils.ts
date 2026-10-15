import { BoundingBox, INormalizedBlock } from '../../../models/normalizedDocument.model';

export function calculateCandidateBoundingBox(
  block: INormalizedBlock | undefined,
  matchStart: number,
  matchEnd: number
): BoundingBox | undefined {
  if (!block) return undefined;

  // 1. Try word-level bounding box union if block.words is present
  if (block.words && block.words.length > 0) {
    let currentPos = 0;
    const matchingBoxes: BoundingBox[] = [];

    for (const word of block.words) {
      // Find position of word in block text starting from currentPos
      const wordIndex = block.text.indexOf(word.text, currentPos);
      if (wordIndex !== -1) {
        const wordStart = wordIndex;
        const wordEnd = wordIndex + word.text.length;
        currentPos = wordEnd;

        // Check if word overlaps with match range
        if (wordStart < matchEnd && wordEnd > matchStart) {
          if (word.boundingBox) {
            matchingBoxes.push(word.boundingBox);
          }
        }
      }
    }

    if (matchingBoxes.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const box of matchingBoxes) {
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
      }

      return {
        x: Math.round(minX * 100) / 100,
        y: Math.round(minY * 100) / 100,
        width: Math.round((maxX - minX) * 100) / 100,
        height: Math.round((maxY - minY) * 100) / 100,
      };
    }
  }

  // 2. Fallback to block bounding box (or character-based interpolation if available)
  if (block.boundingBox) {
    const textLen = block.text.length;
    if (textLen === 0) return block.boundingBox;

    const startRatio = Math.max(0, matchStart / textLen);
    const matchRatio = Math.min(1, (matchEnd - matchStart) / textLen);

    return {
      x: Math.round((block.boundingBox.x + block.boundingBox.width * startRatio) * 100) / 100,
      y: block.boundingBox.y,
      width: Math.round(block.boundingBox.width * matchRatio * 100) / 100,
      height: block.boundingBox.height,
    };
  }

  return undefined;
}
