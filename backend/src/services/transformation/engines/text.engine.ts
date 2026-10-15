import fs from 'fs';
import crypto from 'crypto';
import { ITransformationEngine, TransformationEngineOptions, EngineTransformationResult } from './base.engine';

export class TextEngine implements ITransformationEngine {
  public async transform(options: TransformationEngineOptions): Promise<EngineTransformationResult> {
    const rawContent = await fs.promises.readFile(options.sourceFilePath, 'utf8');
    const warnings: Array<{ code: string; message: string }> = [];
    const appliedRecords: EngineTransformationResult['appliedRecords'] = [];

    let transformedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // Filter candidates with valid decisions
    const candidateItems = options.candidates.map((c) => ({
      candidate: c,
      decision: options.decisions.get(c.candidateId),
    })).filter((item) => item.decision !== undefined);

    // Sort candidates by startOffset descending to safely replace without shifting earlier offsets
    const sorted = [...candidateItems].sort((a, b) => {
      const startA = a.candidate.location?.startOffset ?? 0;
      const startB = b.candidate.location?.startOffset ?? 0;
      return startB - startA;
    });

    let modifiedContent = rawContent;
    const alreadyReplacedTexts = new Set<string>();

    for (const { candidate, decision } of sorted) {
      const decAction = decision!.decision;
      const occurrenceId = `occ_${crypto.randomUUID()}`;

      if (decAction === 'KEEP') {
        skippedCount++;
        appliedRecords.push({
          candidateId: candidate.candidateId,
          occurrenceId,
          decision: 'KEEP',
          operation: 'SKIP_KEEP',
          status: 'SKIPPED',
          location: candidate.location || {},
        });
        continue;
      }

      if (decAction === 'REVIEW') {
        skippedCount++;
        appliedRecords.push({
          candidateId: candidate.candidateId,
          occurrenceId,
          decision: 'REVIEW',
          operation: 'SKIP_REVIEW',
          status: 'SKIPPED',
          location: candidate.location || {},
        });
        continue;
      }

      if (decAction === 'REDACT') {
        const targetText = candidate.text;
        if (!targetText) {
          continue;
        }

        const start = candidate.location?.startOffset;
        const end = candidate.location?.endOffset;

        let replacementText = '';
        if (options.operation === 'MUTATION') {
          replacementText = options.mutationGenerator.getSyntheticReplacement(
            targetText,
            candidate.type,
            candidate.category
          );
        } else {
          replacementText = '█'.repeat(Math.max(targetText.length, 6));
        }

        if (alreadyReplacedTexts.has(targetText)) {
          transformedCount++;
          appliedRecords.push({
            candidateId: candidate.candidateId,
            occurrenceId,
            decision: 'REDACT',
            operation: options.operation === 'MUTATION' ? 'MUTATE' : 'REDACT',
            status: 'APPLIED',
            location: candidate.location || {},
            syntheticValue: options.operation === 'MUTATION' ? replacementText : undefined,
          });
        } else if (
          start !== undefined &&
          end !== undefined &&
          start >= 0 &&
          end <= modifiedContent.length &&
          start <= end &&
          modifiedContent.substring(start, end) === targetText
        ) {
          modifiedContent =
            modifiedContent.substring(0, start) +
            replacementText +
            modifiedContent.substring(end);

          if (modifiedContent.includes(targetText)) {
            modifiedContent = modifiedContent.split(targetText).join(replacementText);
          }

          alreadyReplacedTexts.add(targetText);
          transformedCount++;
          appliedRecords.push({
            candidateId: candidate.candidateId,
            occurrenceId,
            decision: 'REDACT',
            operation: options.operation === 'MUTATION' ? 'MUTATE' : 'REDACT',
            status: 'APPLIED',
            location: candidate.location || {},
            syntheticValue: options.operation === 'MUTATION' ? replacementText : undefined,
          });
        } else if (modifiedContent.includes(targetText)) {
          modifiedContent = modifiedContent.split(targetText).join(replacementText);
          alreadyReplacedTexts.add(targetText);
          transformedCount++;
          appliedRecords.push({
            candidateId: candidate.candidateId,
            occurrenceId,
            decision: 'REDACT',
            operation: options.operation === 'MUTATION' ? 'MUTATE' : 'REDACT',
            status: 'APPLIED',
            location: candidate.location || {},
            syntheticValue: options.operation === 'MUTATION' ? replacementText : undefined,
          });
        } else {
          failedCount++;
          appliedRecords.push({
            candidateId: candidate.candidateId,
            occurrenceId,
            decision: 'REDACT',
            operation: options.operation === 'MUTATION' ? 'MUTATE' : 'REDACT',
            status: 'FAILED',
            location: candidate.location || {},
            failureReason: 'Candidate text not found in source text buffer',
          });
        }
      }
    }

    // Output validation: verify original redacted text is not present in modified content
    await fs.promises.writeFile(options.outputFilePath, modifiedContent, 'utf8');

    return {
      transformedCount,
      skippedCount,
      failedCount,
      warnings,
      appliedRecords,
    };
  }
}
