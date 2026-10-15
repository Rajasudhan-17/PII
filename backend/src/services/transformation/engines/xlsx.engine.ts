import AdmZip from 'adm-zip';
import crypto from 'crypto';
import { ITransformationEngine, TransformationEngineOptions, EngineTransformationResult } from './base.engine';

export class XlsxEngine implements ITransformationEngine {
  public async transform(options: TransformationEngineOptions): Promise<EngineTransformationResult> {
    const zip = new AdmZip(options.sourceFilePath);
    const warnings: Array<{ code: string; message: string }> = [];
    const appliedRecords: EngineTransformationResult['appliedRecords'] = [];

    let transformedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const entries = zip.getEntries();
    // Scan sharedStrings, worksheet XML, sheet comments, formulas, defined names
    const xmlEntries = entries.filter(
      (e) =>
        e.entryName.endsWith('.xml') &&
        (e.entryName.startsWith('xl/') || e.entryName === 'xl/sharedStrings.xml')
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
        let xml = entryXmlMap.get(entry.entryName) || '';

        if (xml.includes(targetText)) {
          const safeRegexp = new RegExp(targetText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          xml = xml.replace(safeRegexp, replacementText);
          entryXmlMap.set(entry.entryName, xml);
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
            : 'Candidate text not found in XLSX XML sheets or shared strings',
        });
      }
    }

    // Write all updated XMLs back into the zip archive
    for (const [entryName, xml] of entryXmlMap.entries()) {
      zip.updateFile(entryName, Buffer.from(xml, 'utf8'));
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
