import { IPIICandidate } from '../../models/piiCandidate.model';
import { INormalizedDocument, INormalizedBlock } from '../../models/normalizedDocument.model';
import { IContextWindowMetadata } from '../../models/contextResult.model';

export interface ExtractedContextWindow {
  windowText: string;
  metadata: IContextWindowMetadata;
  targetBlock: INormalizedBlock | null;
}

export class ContextWindowExtractor {
  private static MAX_WINDOW_LENGTH = 250;

  public static extractWindow(
    candidate: IPIICandidate,
    normalizedDoc: INormalizedDocument
  ): ExtractedContextWindow {
    let targetBlock: INormalizedBlock | null = null;
    let windowText = '';
    let windowType: IContextWindowMetadata['type'] = 'BLOCK';
    let windowStart = candidate.location.startOffset;
    let windowEnd = candidate.location.endOffset;

    // 1. Locate matching block by blockId or offset
    if (candidate.location.blockId && normalizedDoc.blocks) {
      targetBlock =
        normalizedDoc.blocks.find((b) => b.blockId === candidate.location.blockId) || null;
    }

    if (!targetBlock && normalizedDoc.blocks) {
      targetBlock =
        normalizedDoc.blocks.find(
          (b) =>
            candidate.location.startOffset >= b.startOffset &&
            candidate.location.endOffset <= b.endOffset
        ) || null;
    }

    if (targetBlock) {
      const blockText = targetBlock.text || '';
      const localStart = Math.max(0, candidate.location.startOffset - targetBlock.startOffset);
      const localEnd = Math.min(blockText.length, candidate.location.endOffset - targetBlock.startOffset);

      // Expand window bounded around local offsets
      const padding = Math.floor((this.MAX_WINDOW_LENGTH - (localEnd - localStart)) / 2);
      const start = Math.max(0, localStart - padding);
      const end = Math.min(blockText.length, localEnd + padding);

      windowText = blockText.substring(start, end).trim();
      windowStart = targetBlock.startOffset + start;
      windowEnd = targetBlock.startOffset + end;

      if (targetBlock.type === 'HEADER' || targetBlock.type === 'FOOTER') {
        windowType = 'HEADER_FOOTER';
      } else if (targetBlock.type === 'HEADING') {
        windowType = 'SENTENCE';
      } else {
        windowType = 'PARAGRAPH';
      }
    } else {
      // Fallback: construct window around candidate text itself
      windowText = candidate.text;
      windowType = 'BLOCK';
    }

    // Ensure memory bounds
    if (windowText.length > this.MAX_WINDOW_LENGTH) {
      windowText = windowText.substring(0, this.MAX_WINDOW_LENGTH);
    }

    return {
      windowText,
      metadata: {
        type: windowType,
        textLength: windowText.length,
        startOffset: windowStart,
        endOffset: windowEnd,
        blockId: candidate.location.blockId || (targetBlock ? targetBlock.blockId : undefined),
        pageNumber: candidate.location.pageNumber || (targetBlock ? targetBlock.pageNumber : undefined),
      },
      targetBlock,
    };
  }
}
