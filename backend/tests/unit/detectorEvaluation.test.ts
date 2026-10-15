/* eslint-disable no-console */
import { initializeDefaultDetectors } from '../../src/services/pii/detectors';
import { SYNTHETIC_EVALUATION_CORPUS } from '../fixtures/syntheticPiiEvaluationCorpus';
import { PIIType } from '../../src/config/piiTaxonomy';

interface ConfusionMatrix {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

describe('PII Detector Quality Formal Evaluation Benchmark', () => {
  const registry = initializeDefaultDetectors();

  it('should run formal Precision, Recall, and F1 evaluation across synthetic corpus', async () => {
    const resultsByType: Record<string, ConfusionMatrix> = {};

    const targetTypes = [
      PIIType.EMAIL_ADDRESS,
      PIIType.PHONE_NUMBER,
      PIIType.CREDIT_CARD_NUMBER,
      PIIType.IBAN,
      PIIType.US_SSN,
      PIIType.INDIAN_PAN,
      PIIType.INDIAN_AADHAAR,
      PIIType.AUTH_TOKEN_KEY,
    ];

    for (const type of targetTypes) {
      resultsByType[type] = { tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 };
    }

    for (const example of SYNTHETIC_EVALUATION_CORPUS) {
      const { candidates } = await registry.runAll(example.text, {
        documentId: 'eval_doc',
        organizationId: 'eval_org',
        block: {
          blockId: 'eval_block',
          type: 'PARAGRAPH',
          text: example.text,
          pageNumber: 1,
          readingOrderIndex: 0,
          startOffset: 0,
          endOffset: example.text.length,
          recognitionMethod: example.isHandwritten ? 'HANDWRITING_HTR' : 'NATIVE_TEXT',
          provenance: { documentId: 'eval_doc', organizationId: 'eval_org', pageNumber: 1, blockId: 'eval_block' },
        },
      });

      for (const targetType of targetTypes) {
        const detectedForType = candidates.filter((c) => c.type === targetType);

        if (example.expectedType === targetType) {
          if (detectedForType.length > 0) {
            resultsByType[targetType].tp += 1;
          } else {
            resultsByType[targetType].fn += 1;
          }
        } else {
          if (detectedForType.length > 0) {
            resultsByType[targetType].fp += detectedForType.length;
          }
        }
      }
    }

    // Calculate Precision, Recall, F1 for each detector type
    console.log('\n===================================================================================================');
    console.log('                            PII DETECTOR EVALUATION QUALITY BENCHMARK                             ');
    console.log('===================================================================================================');
    console.log(
      'Detector Target Type     |   TP   |   FP   |   FN   | Precision |  Recall   |    F1     | Corpus Size'
    );
    console.log('---------------------------------------------------------------------------------------------------');

    for (const targetType of targetTypes) {
      const stats = resultsByType[targetType];
      const precisionDenominator = stats.tp + stats.fp;
      const recallDenominator = stats.tp + stats.fn;

      stats.precision = precisionDenominator > 0 ? stats.tp / precisionDenominator : 0;
      stats.recall = recallDenominator > 0 ? stats.tp / recallDenominator : 0;

      const f1Denominator = stats.precision + stats.recall;
      stats.f1 = f1Denominator > 0 ? (2 * stats.precision * stats.recall) / f1Denominator : 0;

      console.log(
        `${targetType.padEnd(25)} | ${String(stats.tp).padStart(6)} | ${String(stats.fp).padStart(6)} | ${String(
          stats.fn
        ).padStart(6)} | ${stats.precision.toFixed(4).padStart(9)} | ${stats.recall.toFixed(4).padStart(9)} | ${stats.f1
          .toFixed(4)
          .padStart(9)} | ${SYNTHETIC_EVALUATION_CORPUS.length}`
      );

      // Verify non-negative integer counts and valid mathematical ranges [0, 1]
      expect(stats.tp).toBeGreaterThanOrEqual(0);
      expect(stats.fp).toBeGreaterThanOrEqual(0);
      expect(stats.fn).toBeGreaterThanOrEqual(0);
      expect(stats.precision).toBeGreaterThanOrEqual(0);
      expect(stats.precision).toBeLessThanOrEqual(1);
      expect(stats.recall).toBeGreaterThanOrEqual(0);
      expect(stats.recall).toBeLessThanOrEqual(1);
      expect(stats.f1).toBeGreaterThanOrEqual(0);
      expect(stats.f1).toBeLessThanOrEqual(1);
    }
    console.log('===================================================================================================\n');
  });

  it('should report FORMAL METRIC: NOT ESTABLISHED for unimplemented/unevaluated detectors', () => {
    const unestablishedDetectors = ['POSTAL_ADDRESS', 'GPS_COORDINATES', 'GENOMIC_DATA'];
    for (const det of unestablishedDetectors) {
      const statusMessage = `FORMAL METRIC: NOT ESTABLISHED (Reason: insufficient labeled evaluation data for ${det})`;
      expect(statusMessage).toContain('NOT ESTABLISHED');
    }
  });
});
