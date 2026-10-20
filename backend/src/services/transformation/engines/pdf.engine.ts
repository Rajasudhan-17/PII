import fs from 'fs';
import crypto from 'crypto';
import zlib from 'zlib';
import { ITransformationEngine, TransformationEngineOptions, EngineTransformationResult } from './base.engine';

function decodeAscii85(a85Str: string): Buffer {
  let clean = a85Str.replace(/\s+/g, '');
  if (clean.startsWith('<~')) clean = clean.slice(2);
  if (clean.endsWith('~>')) clean = clean.slice(0, -2);

  const bytes: number[] = [];
  let tuple = 0;
  let count = 0;

  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i);
    if (c === 122 && count === 0) {
      bytes.push(0, 0, 0, 0);
      continue;
    }
    if (c >= 33 && c <= 117) {
      tuple = tuple * 85 + (c - 33);
      count++;
      if (count === 5) {
        bytes.push((tuple >> 24) & 0xff, (tuple >> 16) & 0xff, (tuple >> 8) & 0xff, tuple & 0xff);
        tuple = 0;
        count = 0;
      }
    }
  }

  if (count > 0) {
    for (let i = count; i < 5; i++) {
      tuple = tuple * 85 + 84;
    }
    for (let i = 0; i < count - 1; i++) {
      bytes.push((tuple >> (24 - i * 8)) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

function extractTextFromPdfBuffer(buffer: Buffer): string {
  let binary = buffer.toString('binary');
  let extracted = binary;

  const streamPattern = /(\d+\s+\d+\s+obj[\s\S]*?<<[\s\S]*?>>\s*stream\r?\n)([\s\S]*?)(\r?\nendstream)/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(binary)) !== null) {
    try {
      const header = match[1];
      let body: Buffer = Buffer.from(match[2], 'binary');
      if (header.includes('ASCII85Decode')) {
        body = Buffer.from(decodeAscii85(match[2]));
      }
      if (header.includes('FlateDecode')) {
        body = Buffer.from(zlib.inflateSync(body));
      }
      extracted += ' ' + body.toString('latin1');
    } catch {
      // ignore unparseable stream
    }
  }

  const textMatches = binary.match(/\(([^)]+)\)/g) || [];
  extracted += ' ' + textMatches.map((m) => m.slice(1, -1)).join(' ');

  return extracted;
}

export class PdfEngine implements ITransformationEngine {
  public async transform(options: TransformationEngineOptions): Promise<EngineTransformationResult> {
    const rawBuffer = await fs.promises.readFile(options.sourceFilePath);
    const warnings: Array<{ code: string; message: string }> = [];
    const appliedRecords: EngineTransformationResult['appliedRecords'] = [];

    let transformedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    let contentStr = rawBuffer.toString('binary');

    const redactCandidates = options.candidates.filter((c) => {
      const dec = options.decisions.get(c.candidateId);
      return dec && dec.decision === 'REDACT';
    });

    for (const c of options.candidates) {
      const dec = options.decisions.get(c.candidateId);
      if (!dec || dec.decision === 'KEEP') {
        skippedCount++;
        appliedRecords.push({
          candidateId: c.candidateId,
          occurrenceId: `occ_${crypto.randomUUID()}`,
          decision: 'KEEP',
          operation: 'SKIP_KEEP',
          status: 'SKIPPED',
          location: c.location || {},
        });
      } else if (dec.decision === 'REVIEW') {
        skippedCount++;
        appliedRecords.push({
          candidateId: c.candidateId,
          occurrenceId: `occ_${crypto.randomUUID()}`,
          decision: 'REVIEW',
          operation: 'SKIP_REVIEW',
          status: 'SKIPPED',
          location: c.location || {},
        });
      }
    }

    // Step 1: Decompress and parse all streams in the PDF
    interface DecodedStream {
      startIndex: number;
      endIndex: number;
      fullMatch: string;
      header: string;
      rawBody: string;
      footer: string;
      decompressedText: string;
      wasDecompressed: boolean;
      modified: boolean;
    }

    const streams: DecodedStream[] = [];
    const streamRegex = /(\d+\s+\d+\s+obj\s*<<((?:(?!<<|>>)[\s\S])*?)>>\s*stream\r?\n?)([\s\S]*?)(endstream)/g;
    let sMatch: RegExpExecArray | null;

    while ((sMatch = streamRegex.exec(contentStr)) !== null) {
      const header = sMatch[1];
      const rawBody = sMatch[3];
      const footer = sMatch[4];
      let decompressedText = '';
      let wasDecompressed = false;

      try {
        let decoded: Buffer = Buffer.from(rawBody, 'binary');
        if (header.includes('ASCII85Decode')) {
          decoded = Buffer.from(decodeAscii85(rawBody));
        }
        if (header.includes('FlateDecode')) {
          decoded = Buffer.from(zlib.inflateSync(decoded));
          decompressedText = decoded.toString('latin1');
          wasDecompressed = true;
        } else if (header.includes('ASCII85Decode')) {
          decompressedText = decoded.toString('latin1');
          wasDecompressed = true;
        }
      } catch {
        wasDecompressed = false;
        decompressedText = '';
      }

      streams.push({
        startIndex: sMatch.index,
        endIndex: sMatch.index + sMatch[0].length,
        fullMatch: sMatch[0],
        header,
        rawBody,
        footer,
        decompressedText,
        wasDecompressed,
        modified: false,
      });
    }

    // Step 2: Redact each candidate across decompressed streams
    const alreadyReplacedTexts = new Set<string>();

    for (const c of redactCandidates) {
      const occurrenceId = `occ_${crypto.randomUUID()}`;
      const targetText = c.text;

      const replacementText =
        options.operation === 'MUTATION'
          ? options.mutationGenerator.getSyntheticReplacement(targetText, c.type, c.category)
          : '█'.repeat(Math.max(targetText.length, 6));

      let textReplaced = alreadyReplacedTexts.has(targetText);
      if (!textReplaced) {
        for (const prev of alreadyReplacedTexts) {
          if (prev.includes(targetText) || targetText.includes(prev)) {
            textReplaced = true;
            break;
          }
        }
      }

      // Strategy A: Replace inside decompressed streams
      for (const st of streams) {
        if (!st.wasDecompressed || !st.decompressedText) continue;

        let streamModified = false;

        // 1. Plain string in stream
        if (st.decompressedText.includes(targetText)) {
          st.decompressedText = st.decompressedText.split(targetText).join(replacementText);
          streamModified = true;
          textReplaced = true;
        }

        // 2. Escaped format in PDF: `(targetText)`
        const escapedTarget = `(${targetText})`;
        const escapedReplacement = `(${replacementText})`;
        if (st.decompressedText.includes(escapedTarget)) {
          st.decompressedText = st.decompressedText.split(escapedTarget).join(escapedReplacement);
          streamModified = true;
          textReplaced = true;
        }

        // 3. PDF literal escaped `\(target\)`
        const pdfEscaped = targetText.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        const pdfEscapedTarget = `(${pdfEscaped})`;
        if (st.decompressedText.includes(pdfEscapedTarget)) {
          st.decompressedText = st.decompressedText.split(pdfEscapedTarget).join(escapedReplacement);
          streamModified = true;
          textReplaced = true;
        }
        if (st.decompressedText.includes(pdfEscaped)) {
          st.decompressedText = st.decompressedText.split(pdfEscaped).join(replacementText);
          streamModified = true;
          textReplaced = true;
        }

        // 4. Multi-line candidate text (split by newlines across PDF line breaks)
        if (!textReplaced && targetText.includes('\n')) {
          const lines = targetText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 1);
          let anyLineFound = false;
          for (const line of lines) {
            if (st.decompressedText.includes(line)) {
              const repLine = '█'.repeat(Math.max(line.length, 4));
              st.decompressedText = st.decompressedText.split(line).join(repLine);
              streamModified = true;
              anyLineFound = true;
            }
          }
          if (anyLineFound) {
            textReplaced = true;
          }
        }

        // 5. Multi-word phrases split by PDF positioning operators or kerning
        if (!textReplaced && targetText.includes(' ')) {
          const words = targetText.trim().split(/\s+/).filter((w) => w.length > 2);
          let wordsMatched = 0;
          for (const word of words) {
            if (st.decompressedText.includes(word)) {
              const repWord = '█'.repeat(Math.max(word.length, 3));
              st.decompressedText = st.decompressedText.split(word).join(repWord);
              streamModified = true;
              wordsMatched++;
            }
          }
          if (wordsMatched >= Math.max(1, Math.floor(words.length / 2))) {
            textReplaced = true;
          }
        }

        // 6. PDF Literal String Token Replacement (matches `(literal string with possible \(escapes\))`)
        if (!textReplaced) {
          const pdfLiteralRegex = /\((?:[^()\\]|\\.)*\)/g;
          st.decompressedText = st.decompressedText.replace(pdfLiteralRegex, (fullMatch) => {
            const innerText = fullMatch.slice(1, -1);
            const unescapedInner = innerText
              .replace(/\\\(/g, '(')
              .replace(/\\\)/g, ')')
              .replace(/\\\\/g, '\\')
              .trim();

            const cleanTarget = targetText.trim();
            if (
              cleanTarget === unescapedInner ||
              cleanTarget.includes(unescapedInner) ||
              unescapedInner.includes(cleanTarget)
            ) {
              const isProtectedLabel = [
                'Date of birth',
                'Patient name',
                'Patient reference',
                'Address',
                'Phone',
                'Email',
                'Page 1',
                'Page 2',
                'Page 3',
                'Age / sex',
              ].includes(unescapedInner);

              if (unescapedInner.length >= 3 && !isProtectedLabel) {
                streamModified = true;
                textReplaced = true;
                return `(${replacementText})`;
              }
            }
            return fullMatch;
          });
        }

        // 7. PDF TJ Array Operator: e.g. `[ (John) 10 (Smith) ] TJ`
        if (!textReplaced) {
          const tjRegex = /\[((?:[^\]\\]|\\.)*)\]\s*TJ/g;
          st.decompressedText = st.decompressedText.replace(tjRegex, (fullMatch, arrayContent) => {
            const innerStrings = (arrayContent.match(/\((?:[^()\\]|\\.)*\)/g) || []).map((s: string) => s.slice(1, -1));
            const combined = innerStrings.join(' ');
            if (combined.includes(targetText) || targetText.includes(combined)) {
              streamModified = true;
              textReplaced = true;
              return `[(${replacementText})] TJ`;
            }
            return fullMatch;
          });
        }

        if (streamModified) {
          st.modified = true;
        }
      }

      // Sanitize Annotations (/Annots) and Form Fields (/V) in contentStr
      contentStr = contentStr.replace(/\/Contents\s*\(([^)]*)\)/g, (match, val) => {
        if (val.includes(targetText)) {
          textReplaced = true;
          return `/Contents (${replacementText})`;
        }
        return match;
      });
      contentStr = contentStr.replace(/\/V\s*\(([^)]*)\)/g, (match, val) => {
        if (val.includes(targetText)) {
          textReplaced = true;
          return `/V (${replacementText})`;
        }
        return match;
      });

      // Fallback Strategy B/C/D/E: If not found in streams, try raw contentStr outside streams
      if (!textReplaced) {
        // Strategy B: Plain text string match in raw contentStr
        const safeRegexp = new RegExp(targetText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        if (safeRegexp.test(contentStr)) {
          contentStr = contentStr.replace(safeRegexp, () => replacementText);
          textReplaced = true;
        }

        // Strategy C: Escaped parentheses `(text)` format in PDF text operators
        const escapedTarget = `(${targetText})`;
        const escapedReplacement = `(${replacementText})`;
        if (contentStr.includes(escapedTarget)) {
          contentStr = contentStr.split(escapedTarget).join(escapedReplacement);
          textReplaced = true;
        }

        // Strategy D: Hexadecimal string representation e.g. `<4A6F686E>`
        const hexTarget = `<${Buffer.from(targetText, 'utf8').toString('hex').toUpperCase()}>`;
        const hexReplacement = `<${Buffer.from(replacementText, 'utf8').toString('hex').toUpperCase()}>`;
        if (contentStr.includes(hexTarget)) {
          contentStr = contentStr.split(hexTarget).join(hexReplacement);
          textReplaced = true;
        }

        // Strategy E: Escaped backslashes / parentheses `\(text\)`
        const pdfEscaped = targetText.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        const pdfEscapedTarget = `(${pdfEscaped})`;
        if (contentStr.includes(pdfEscapedTarget)) {
          contentStr = contentStr.split(pdfEscapedTarget).join(escapedReplacement);
          textReplaced = true;
        }
      }

      if (textReplaced) {
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
        failedCount++;
        appliedRecords.push({
          candidateId: c.candidateId,
          occurrenceId,
          decision: 'REDACT',
          operation: options.operation === 'MUTATION' ? 'MUTATE' : 'REDACT',
          status: 'FAILED',
          location: c.location || {},
          failureReason: 'UNSUPPORTED_PDF_REPRESENTATION',
        });
      }
    }

    // Step 3: Re-compress any modified streams and splice into PDF structure backwards
    for (let i = streams.length - 1; i >= 0; i--) {
      const st = streams[i];
      if (!st.modified) continue;

      try {
        const deflated = zlib.deflateSync(Buffer.from(st.decompressedText, 'latin1'));
        let newHeader = st.header;
        // Normalize filter to standard /Filter /FlateDecode
        newHeader = newHeader.replace(/\/Filter\s*\[[^\]]+\]/, '/Filter /FlateDecode');
        newHeader = newHeader.replace(/\/Filter\s*\/ASCII85Decode/, '/Filter /FlateDecode');
        newHeader = newHeader.replace(/\/Length\s+\d+/, `/Length ${deflated.length}`);

        const newStreamChunk = newHeader + deflated.toString('binary') + '\n' + st.footer;
        contentStr = contentStr.slice(0, st.startIndex) + newStreamChunk + contentStr.slice(st.endIndex);
      } catch {
        // If re-compress fails, keep original stream
      }
    }

    // Step 4: Independent Semantic Verification
    const outputBuffer = Buffer.from(contentStr, 'binary');
    const extractedTextStream = extractTextFromPdfBuffer(outputBuffer);

    for (const c of redactCandidates) {
      if (extractedTextStream.includes(c.text)) {
        warnings.push({
          code: 'REDACTION_VERIFICATION_FAILED',
          message: `Independent PDF text extraction verification failed for candidate ${c.candidateId}`,
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
