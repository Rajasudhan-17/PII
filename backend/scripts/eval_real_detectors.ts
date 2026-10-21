/**
 * Real PII Detectors Evaluation Harness
 * 
 * Runs the REAL registered detectors (initializeDefaultDetectors) against a gold-standard corpus.
 * Does NOT use benchmarkRunner's regex copies.
 */

// Set dummy environment variables to satisfy config imports if needed
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pii_eval_dummy';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'eval_secret_key_minimum_32_characters_long_12345';

import fs from 'fs';
import path from 'path';
import { initializeDefaultDetectors, RawDetectedCandidate } from '../src/services/pii/detectors';
import { suppressContainedPhoneCandidates, suppressContainedAddressCandidates } from '../src/services/pii/utils/candidateMerger.utils';

interface GoldEntity {
  type: string;
  text: string;
  startOffset?: number;
  endOffset?: number;
  matched?: boolean;
}

interface CorpusDocument {
  document: string;
  documentType: string;
  split?: 'dev' | 'heldout';
  text: string;
  entities: GoldEntity[];
}

interface EvaluationResult {
  split: string;
  totalDocuments: number;
  groundTruthCount: number;
  predictionCount: number;
  overall: {
    tp: number;
    fp: number;
    fn: number;
    precision: number;
    recall: number;
    f1: number;
  };
  perType: Record<
    string,
    {
      tp: number;
      fp: number;
      fn: number;
      precision: number;
      recall: number;
      f1: number;
    }
  >;
  falsePositives: Array<{
    document: string;
    type: string;
    text: string;
    startOffset: number;
    endOffset: number;
    snippet: string;
  }>;
  falseNegatives: Array<{
    document: string;
    type: string;
    text: string;
    startOffset?: number;
    endOffset?: number;
  }>;
}

export function normalizeType(t: string): string {
  const upper = t.toUpperCase().replace(/[- ]/g, '_');
  if (['PERSON_NAME', 'NAME', 'PERSON'].includes(upper)) return 'PERSON_NAME';
  if (['EMAIL_ADDRESS', 'EMAIL'].includes(upper)) return 'EMAIL_ADDRESS';
  if (['PHONE_NUMBER', 'PHONE'].includes(upper)) return 'PHONE_NUMBER';
  if (['CREDIT_CARD', 'CREDIT_CARD_NUMBER', 'CARD'].includes(upper)) return 'CREDIT_CARD_NUMBER';
  if (['IBAN', 'IBAN_NUMBER'].includes(upper)) return 'IBAN';
  if (['US_SSN', 'SSN'].includes(upper)) return 'US_SSN';
  if (['INDIAN_PAN', 'PAN', 'PAN_NUMBER'].includes(upper)) return 'INDIAN_PAN';
  if (['INDIAN_AADHAAR', 'AADHAAR', 'AADHAAR_NUMBER'].includes(upper)) return 'INDIAN_AADHAAR';
  if (['DATE_OF_BIRTH', 'DOB', 'BIRTH'].includes(upper)) return 'DATE_OF_BIRTH';
  if (['POSTAL_ADDRESS', 'STREET_ADDRESS', 'ADDRESS', 'CITY', 'LOCATION'].includes(upper)) return 'POSTAL_ADDRESS';
  if (['AUTH_TOKEN_KEY', 'API_KEY', 'AUTH_TOKEN', 'TOKEN', 'PRIVATE_KEY', 'PASSWORD'].includes(upper)) return 'AUTH_TOKEN_KEY';
  if (['PASSPORT', 'INDIAN_PASSPORT'].includes(upper)) return 'PASSPORT';
  if (['DRIVING_LICENSE', 'INDIAN_DL', 'DL'].includes(upper)) return 'DRIVING_LICENSE';
  return upper;
}

export function areTypesCompatible(predType: string, goldType: string): boolean {
  return normalizeType(predType) === normalizeType(goldType);
}

export async function runEvaluation(options: {
  corpusPath: string;
  splitFilter?: 'dev' | 'heldout' | 'all';
  outputPath?: string;
  quietFpFn?: boolean;
}): Promise<EvaluationResult> {
  const {
    corpusPath,
    splitFilter = 'dev',
    outputPath,
    quietFpFn = false,
  } = options;

  if (!fs.existsSync(corpusPath)) {
    throw new Error(`Corpus file not found: ${corpusPath}`);
  }

  const rawCorpus: CorpusDocument[] = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  const filteredCorpus = rawCorpus.filter((doc) => {
    if (!splitFilter || splitFilter === 'all') return true;
    return doc.split === splitFilter;
  });

  const registry = initializeDefaultDetectors();
  const detectors = registry.getAllDetectors();

  let overallTp = 0;
  let overallFp = 0;
  let overallFn = 0;

  const perTypeStats: Record<
    string,
    { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number }
  > = {};

  const falsePositives: EvaluationResult['falsePositives'] = [];
  const falseNegatives: EvaluationResult['falseNegatives'] = [];

  let totalGoldEntities = 0;
  let totalPredictions = 0;

  for (const doc of filteredCorpus) {
    const text = doc.text || '';
    
    // Ensure all gold entities have accurate offsets
    const goldEntities: GoldEntity[] = (doc.entities || []).map((ge) => {
      let start = ge.startOffset ?? -1;
      let end = ge.endOffset ?? -1;
      if (start === -1 && ge.text) {
        start = text.indexOf(ge.text);
        if (start !== -1) {
          end = start + ge.text.length;
        }
      }
      return {
        ...ge,
        startOffset: start,
        endOffset: end,
        matched: false,
      };
    });

    totalGoldEntities += goldEntities.length;

    // Run all real registered detectors
    const predictions: RawDetectedCandidate[] = [];
    for (const detector of detectors) {
      try {
        const results = await detector.detect(text, {
          documentId: doc.document,
          organizationId: 'eval_harness',
          fullText: text,
        });
        predictions.push(...results);
      } catch (err) {
        console.error(`Detector ${detector.name} threw error on ${doc.document}:`, err);
      }
    }

    // Suppress overlapping candidates:
    // 1. Phone numbers contained within stronger identifiers (Credit Card, IBAN, SSN, Aadhaar, PAN)
    // 2. Fragmented city/address candidates contained within composite addresses
    const phoneFiltered = suppressContainedPhoneCandidates(predictions);
    const finalPredictions = suppressContainedAddressCandidates(phoneFiltered);
    totalPredictions += finalPredictions.length;

    // Match predictions to gold entities
    // A prediction is a true positive if its span overlaps a gold span by >= 50%
    // and types are compatible.
    for (const pred of finalPredictions) {
      const predNormType = normalizeType(pred.type);
      if (!perTypeStats[predNormType]) {
        perTypeStats[predNormType] = { tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 };
      }

      let bestMatchIdx = -1;
      let bestOverlapRatio = 0;

      for (let gIdx = 0; gIdx < goldEntities.length; gIdx++) {
        const gold = goldEntities[gIdx];
        if (gold.matched) continue;
        if (!areTypesCompatible(pred.type, gold.type)) continue;

        const gStart = gold.startOffset ?? 0;
        const gEnd = gold.endOffset ?? 0;
        const pStart = pred.startOffset;
        const pEnd = pred.endOffset;

        const overlapStart = Math.max(pStart, gStart);
        const overlapEnd = Math.min(pEnd, gEnd);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        const goldLen = Math.max(1, gEnd - gStart);
        const overlapRatio = overlap / goldLen;

        if (overlapRatio >= 0.5 && overlapRatio > bestOverlapRatio) {
          bestOverlapRatio = overlapRatio;
          bestMatchIdx = gIdx;
        }
      }

      if (bestMatchIdx !== -1) {
        // True Positive
        goldEntities[bestMatchIdx].matched = true;
        overallTp++;
        perTypeStats[predNormType].tp++;
      } else {
        // False Positive
        overallFp++;
        perTypeStats[predNormType].fp++;
        const snippetStart = Math.max(0, pred.startOffset - 25);
        const snippetEnd = Math.min(text.length, pred.endOffset + 25);
        const snippet = text.slice(snippetStart, snippetEnd).replace(/\n/g, ' ');

        falsePositives.push({
          document: doc.document,
          type: pred.type,
          text: pred.text,
          startOffset: pred.startOffset,
          endOffset: pred.endOffset,
          snippet: `"...${snippet}..."`,
        });
      }
    }

    // Remaining unmatched gold entities are False Negatives
    for (const gold of goldEntities) {
      if (!gold.matched) {
        overallFn++;
        const goldNormType = normalizeType(gold.type);
        if (!perTypeStats[goldNormType]) {
          perTypeStats[goldNormType] = { tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 };
        }
        perTypeStats[goldNormType].fn++;

        falseNegatives.push({
          document: doc.document,
          type: gold.type,
          text: gold.text,
          startOffset: gold.startOffset,
          endOffset: gold.endOffset,
        });
      }
    }
  }

  // Calculate Precision, Recall, F1
  const calcP = (tp: number, fp: number) => (tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0);
  const calcR = (tp: number, fn: number) => (tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0);
  const calcF1 = (p: number, r: number) => (p + r > 0 ? (2 * p * r) / (p + r) : 0);

  const overallPrec = calcP(overallTp, overallFp);
  const overallRec = calcR(overallTp, overallFn);
  const overallF1 = calcF1(overallPrec, overallRec);

  for (const type of Object.keys(perTypeStats)) {
    const s = perTypeStats[type];
    s.precision = Math.round(calcP(s.tp, s.fp) * 10) / 10;
    s.recall = Math.round(calcR(s.tp, s.fn) * 10) / 10;
    s.f1 = Math.round(calcF1(s.precision, s.recall) * 10) / 10;
  }

  const results: EvaluationResult = {
    split: splitFilter,
    totalDocuments: filteredCorpus.length,
    groundTruthCount: totalGoldEntities,
    predictionCount: totalPredictions,
    overall: {
      tp: overallTp,
      fp: overallFp,
      fn: overallFn,
      precision: Math.round(overallPrec * 10) / 10,
      recall: Math.round(overallRec * 10) / 10,
      f1: Math.round(overallF1 * 10) / 10,
    },
    perType: perTypeStats,
    falsePositives,
    falseNegatives,
  };

  // Print Formatted Report
  console.log('\n================================================================================');
  console.log(` REAL DETECTOR EVALUATION HARNESS — SPLIT: ${splitFilter.toUpperCase()}`);
  console.log('================================================================================');
  console.log(`Corpus:           ${corpusPath}`);
  console.log(`Total Documents:  ${results.totalDocuments}`);
  console.log(`Ground Truth:     ${results.groundTruthCount}`);
  console.log(`Predictions:      ${results.predictionCount}`);
  console.log(`True Positives:   ${results.overall.tp}`);
  console.log(`False Positives:  ${results.overall.fp}`);
  console.log(`False Negatives:  ${results.overall.fn}`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`OVERALL PRECISION: ${results.overall.precision.toFixed(1)}%`);
  console.log(`OVERALL RECALL:    ${results.overall.recall.toFixed(1)}%`);
  console.log(`OVERALL F1 SCORE:  ${results.overall.f1.toFixed(1)}%`);
  console.log('--------------------------------------------------------------------------------');
  console.log('PER-ENTITY BREAKDOWN:');
  for (const [type, stats] of Object.entries(results.perType).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(
      `  ${type.padEnd(20)} | TP: ${String(stats.tp).padStart(3)} | FP: ${String(stats.fp).padStart(3)} | FN: ${String(stats.fn).padStart(3)} | P: ${stats.precision.toFixed(1).padStart(5)}% | R: ${stats.recall.toFixed(1).padStart(5)}% | F1: ${stats.f1.toFixed(1).padStart(5)}%`
    );
  }
  console.log('================================================================================');

  if (!quietFpFn) {
    console.log(`\nFALSE POSITIVES SAMPLE (First 15 of ${results.falsePositives.length}):`);
    for (const fp of results.falsePositives.slice(0, 15)) {
      console.log(`  [${fp.document}] ${fp.type} -> "${fp.text}" (in ${fp.snippet})`);
    }

    console.log(`\nFALSE NEGATIVES SAMPLE (First 15 of ${results.falseNegatives.length}):`);
    for (const fn of results.falseNegatives.slice(0, 15)) {
      console.log(`  [${fn.document}] ${fn.type} -> "${fn.text}"`);
    }
    console.log('================================================================================\n');
  }

  if (outputPath) {
    const resolvedOut = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Saved evaluation results to: ${resolvedOut}`);
  }

  return results;
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  let corpusPath = path.resolve(__dirname, '../tests/gold-standard/eval_v2.json');
  let splitFilter: 'dev' | 'heldout' | 'all' = 'dev';
  let outputPath = path.resolve(__dirname, '../docs/eval_baseline.json');

  for (const arg of args) {
    if (arg.startsWith('--corpus=')) {
      corpusPath = path.resolve(arg.split('=')[1]);
    } else if (arg.startsWith('--split=')) {
      splitFilter = arg.split('=')[1] as 'dev' | 'heldout' | 'all';
    } else if (arg.startsWith('--output=')) {
      outputPath = path.resolve(arg.split('=')[1]);
    } else if (arg.startsWith('--ner-url=')) {
      process.env.NER_SERVICE_URL = arg.split('=')[1];
    }
  }

  runEvaluation({
    corpusPath,
    splitFilter,
    outputPath,
  })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Evaluation harness failed:', err);
      process.exit(1);
    });
}
