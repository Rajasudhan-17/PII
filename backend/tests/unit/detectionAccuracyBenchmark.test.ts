import fs from 'fs';
import path from 'path';
import { BenchmarkRunner, SyntheticDocumentRecord } from '../../src/evaluation/benchmarkRunner';

describe('PII Detection Accuracy Benchmark — High Recall + High Precision', () => {
  let corpus: SyntheticDocumentRecord[] = [];

  beforeAll(() => {
    const corpusPath = path.resolve(__dirname, '../gold-standard/syntheticCorpus.json');
    const rawData = fs.readFileSync(corpusPath, 'utf-8');
    corpus = JSON.parse(rawData);
  });

  it('loads the synthetic gold-standard corpus with ground-truth entities', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(5);
    const totalEntities = corpus.reduce((acc, doc) => acc + doc.entities.length, 0);
    expect(totalEntities).toBeGreaterThanOrEqual(20);
  });

  it('achieves high recall (>= 95%) with zero silently missed ground-truth PII', () => {
    const report = BenchmarkRunner.evaluateCorpus(corpus);

    console.log('\n================================================================================');
    console.log('              PII DETECTION BENCHMARK REPORT (GOLD STANDARD)                    ');
    console.log('================================================================================');
    console.log(`TOTAL GROUND TRUTH ENTITIES: ${report.totalGroundTruthEntities}`);
    console.log(`TRUE POSITIVES (TP):        ${report.overall.tp}`);
    console.log(`FALSE POSITIVES (FP):       ${report.overall.fp}`);
    console.log(`FALSE NEGATIVES (FN):       ${report.overall.fn}`);
    console.log(`OVERALL PRECISION:          ${report.overall.precision}%`);
    console.log(`OVERALL RECALL:             ${report.overall.recall}%`);
    console.log(`OVERALL F1 SCORE:           ${report.overall.f1}%`);
    console.log('--------------------------------------------------------------------------------');
    console.log('DETECTOR BREAKDOWN:');
    for (const [det, stats] of Object.entries(report.byDetector)) {
      console.log(`  - ${det.padEnd(20)}: Precision=${stats.precision}% | Recall=${stats.recall}% | F1=${stats.f1}%`);
    }
    console.log('--------------------------------------------------------------------------------');
    console.log('DOCUMENT TYPE BREAKDOWN:');
    for (const [type, stats] of Object.entries(report.byDocumentType)) {
      console.log(`  - ${type.padEnd(20)}: Precision=${stats.precision}% | Recall=${stats.recall}% | F1=${stats.f1}%`);
    }
    console.log('--------------------------------------------------------------------------------');
    console.log(`FALSE-POSITIVE EXAMPLES (Count: ${report.fpExamples.length}):`);
    if (report.fpExamples.length === 0) {
      console.log('  [None - Zero False Positives]');
    } else {
      for (const fp of report.fpExamples) {
        console.log(`  - Doc: ${fp.document} | Candidate: "${fp.candidate}" (${fp.type}) | Reason: ${fp.reason}`);
      }
    }
    console.log('--------------------------------------------------------------------------------');
    console.log(`FALSE-NEGATIVE EXAMPLES (Count: ${report.fnExamples.length}):`);
    if (report.fnExamples.length === 0) {
      console.log('  [None - Zero False Negatives]');
    } else {
      for (const fn of report.fnExamples) {
        console.log(`  - Doc: ${fn.document} | Expected: "${fn.expected}" (${fn.type}) | Reason: ${fn.reason}`);
      }
    }
    console.log('================================================================================\n');

    expect(report.overall.recall).toBeGreaterThanOrEqual(95.0);
    expect(report.overall.precision).toBeGreaterThanOrEqual(95.0);
    expect(report.overall.f1).toBeGreaterThanOrEqual(95.0);
    expect(report.overall.fn).toBe(0); // Zero silent omissions
  });
});
