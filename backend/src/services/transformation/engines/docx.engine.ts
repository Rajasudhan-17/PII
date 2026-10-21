import AdmZip from 'adm-zip';
import crypto from 'crypto';
import { ITransformationEngine, TransformationEngineOptions, EngineTransformationResult } from './base.engine';

/**
 * Redacts a target text from Word XML, handling cases where the text
 * is continuous or split across multiple <w:r><w:t> runs.
 */
export function redactWordXml(
  xml: string,
  targetText: string,
  replacementText: string
): { xml: string; matched: boolean } {
  let modifiedXml = xml;
  let matched = false;

  // 1. Direct match (when text is within a single <w:t> run)
  if (modifiedXml.includes(targetText)) {
    const safeRegexp = new RegExp(targetText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    modifiedXml = modifiedXml.replace(safeRegexp, replacementText);
    return { xml: modifiedXml, matched: true };
  }

  // 2. Cross-run match within paragraphs (<w:p>) or table cells (<w:tc>)
  const pRegex = /(<w:p\b[^>]*>[\s\S]*?<\/w:p>)/g;
  modifiedXml = modifiedXml.replace(pRegex, (pXml) => {
    // Extract all <w:t> runs within this paragraph
    const tRegex = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g;
    const runs: Array<{ fullMatch: string; prefix: string; text: string; suffix: string; start: number; end: number }> = [];
    let aggregatedText = '';

    let match: RegExpExecArray | null;
    while ((match = tRegex.exec(pXml)) !== null) {
      const prefix = match[1];
      const text = match[2];
      const suffix = match[3];
      const start = aggregatedText.length;
      aggregatedText += text;
      const end = aggregatedText.length;

      runs.push({
        fullMatch: match[0],
        prefix,
        text,
        suffix,
        start,
        end,
      });
    }

    if (!aggregatedText.includes(targetText)) {
      return pXml;
    }

    // Target text found spanning across runs!
    matched = true;
    let targetIdx = aggregatedText.indexOf(targetText);
    let updatedPXml = pXml;

    while (targetIdx !== -1) {
      const targetEnd = targetIdx + targetText.length;

      // Find all runs that overlap with [targetIdx, targetEnd]
      let firstRunReplaced = false;

      for (const run of runs) {
        // Run completely before or after
        if (run.end <= targetIdx || run.start >= targetEnd) {
          continue;
        }

        // Run overlaps
        const overlapStartInRun = Math.max(0, targetIdx - run.start);
        const overlapEndInRun = Math.min(run.text.length, targetEnd - run.start);

        const before = run.text.substring(0, overlapStartInRun);
        const after = run.text.substring(overlapEndInRun);

        let newRunText = '';
        if (!firstRunReplaced) {
          newRunText = before + replacementText + after;
          firstRunReplaced = true;
        } else {
          newRunText = before + after;
        }

        const oldTag = run.prefix + run.text + run.suffix;
        const newTag = run.prefix + newRunText + run.suffix;
        updatedPXml = updatedPXml.replace(oldTag, newTag);

        // Update in-memory run text for subsequent occurrences
        run.text = newRunText;
      }

      // Check for next occurrence
      aggregatedText = aggregatedText.substring(0, targetIdx) + replacementText + aggregatedText.substring(targetEnd);
      targetIdx = aggregatedText.indexOf(targetText, targetIdx + replacementText.length);
    }

    return updatedPXml;
  });

  return { xml: modifiedXml, matched };
}

export class DocxEngine implements ITransformationEngine {
  public async transform(options: TransformationEngineOptions): Promise<EngineTransformationResult> {
    const zip = new AdmZip(options.sourceFilePath);
    const warnings: Array<{ code: string; message: string }> = [];
    const appliedRecords: EngineTransformationResult['appliedRecords'] = [];

    let transformedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const entries = zip.getEntries();
    // Scan document XML, headers, footers, comments, footnotes, endnotes
    const xmlEntries = entries.filter(
      (e) =>
        e.entryName.endsWith('.xml') &&
        (e.entryName.startsWith('word/') || e.entryName === 'word/document.xml')
    );

    const redactCandidates = options.candidates.filter((c) => {
      const dec = options.decisions.get(c.candidateId);
      return dec && dec.decision === 'REDACT';
    });

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
      } else if (dec.decision === 'REVIEW') {
        skippedCount++;
        appliedRecords.push({
          candidateId: c.candidateId,
          occurrenceId,
          decision: 'REVIEW',
          operation: 'SKIP_REVIEW',
          status: 'SKIPPED',
          location: c.location || {},
        });
      }
    }

    // Accumulate XML modifications across candidates
    const entryXmlMap = new Map<string, string>();
    for (const entry of xmlEntries) {
      entryXmlMap.set(entry.entryName, entry.getData().toString('utf8'));
    }

    const alreadyReplacedTexts = new Set<string>();

    for (const c of redactCandidates) {
      const occurrenceId = `occ_${crypto.randomUUID()}`;
      const targetText = c.text;
      let matchedInXml = alreadyReplacedTexts.has(targetText);

      const replacementText =
        options.operation === 'MUTATION'
          ? options.mutationGenerator.getSyntheticReplacement(targetText, c.type, c.category)
          : '█'.repeat(Math.max(targetText.length, 6));

      for (const entry of xmlEntries) {
        const xml = entryXmlMap.get(entry.entryName) || '';

        const redactRes = redactWordXml(xml, targetText, replacementText);
        if (redactRes.matched) {
          entryXmlMap.set(entry.entryName, redactRes.xml);
          matchedInXml = true;
        }
      }

      if (matchedInXml) {
        alreadyReplacedTexts.add(targetText);
        transformedCount++;
        appliedRecords.push({
          candidateId: c.candidateId,
          occurrenceId,
          decision: 'REDACT',
          operation: options.operation === 'MUTATION' ? 'MUTATE' : 'REDACT',
          status: 'APPLIED',
          location: c.location || {},
          syntheticValue: options.operation === 'MUTATION' ? replacementText : undefined,
        });
      } else {
        // Check if text is present in unsupported binary entries (e.g. word/embeddings/ or vbaProject.bin)
        let foundInUnsupported = false;
        for (const entry of entries) {
          if (!entry.entryName.endsWith('.xml')) {
            const rawData = entry.getData().toString('utf8');
            if (rawData.includes(targetText)) {
              foundInUnsupported = true;
              break;
            }
          }
        }

        failedCount++;
        appliedRecords.push({
          candidateId: c.candidateId,
          occurrenceId,
          decision: 'REDACT',
          operation: options.operation === 'MUTATION' ? 'MUTATE' : 'REDACT',
          status: 'FAILED',
          location: c.location || {},
          failureReason: foundInUnsupported
            ? 'UNSUPPORTED_OFFICE_STRUCTURE'
            : 'Candidate text not found in DOCX XML streams',
        });
      }
    }

    // Write all updated XMLs back into the zip archive
    for (const [entryName, xml] of entryXmlMap.entries()) {
      zip.updateFile(entryName, Buffer.from(xml, 'utf8'));
    }

    // Security sanitization: Remove any thumbnail previews that Word automatically caches
    for (const entry of entries) {
      if (
        entry.entryName.startsWith('docProps/thumbnail') ||
        entry.entryName.endsWith('.emf') ||
        entry.entryName.endsWith('.wmf')
      ) {
        zip.deleteFile(entry.entryName);
      }
    }

    zip.writeZip(options.outputFilePath);

    return {
      transformedCount,
      skippedCount,
      failedCount,
      warnings,
      appliedRecords,
    };
  }
}
