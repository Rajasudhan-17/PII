import { EvidenceAggregator, CandidateInput } from '../../src/detection/evidenceAggregator';

describe('Adversarial False-Negative Resilience Tests', () => {
  it('correctly catches and corroborates clustered PII even when individual detectors report medium confidence', () => {
    const clinicalText = `
      MEDICAL SUMMARY:
      Patient Name: Ananya Krishnan
      DOB: 17/08/1988
      Phone: +91 98765 43210
      Email: ananya.k@health-mail.example
      Attending: Dr. Vikram Seth
    `;

    const rawCandidates: CandidateInput[] = [
      {
        type: 'PERSON_NAME',
        label: 'NAME',
        value: 'Ananya Krishnan',
        startOffset: clinicalText.indexOf('Ananya Krishnan'),
        endOffset: clinicalText.indexOf('Ananya Krishnan') + 'Ananya Krishnan'.length,
        detector: 'ContextualNER',
        confidence: 0.88,
      },
      {
        type: 'DATE_OF_BIRTH',
        label: 'BIRTH',
        value: '17/08/1988',
        startOffset: clinicalText.indexOf('17/08/1988'),
        endOffset: clinicalText.indexOf('17/08/1988') + '17/08/1988'.length,
        detector: 'DOBRegex',
        confidence: 0.9,
      },
      {
        type: 'PHONE_NUMBER',
        label: 'PHONE',
        value: '+91 98765 43210',
        startOffset: clinicalText.indexOf('+91 98765 43210'),
        endOffset: clinicalText.indexOf('+91 98765 43210') + '+91 98765 43210'.length,
        detector: 'PhoneRegex',
        confidence: 0.94,
      },
      {
        type: 'EMAIL_ADDRESS',
        label: 'EMAIL',
        value: 'ananya.k@health-mail.example',
        startOffset: clinicalText.indexOf('ananya.k@health-mail.example'),
        endOffset: clinicalText.indexOf('ananya.k@health-mail.example') + 'ananya.k@health-mail.example'.length,
        detector: 'EmailRegex',
        confidence: 0.98,
      },
    ];

    const results = EvidenceAggregator.aggregateAndDecide(clinicalText, rawCandidates);

    // ZERO silent drops
    expect(results.length).toBe(4);
    for (const cand of results) {
      expect(cand.decision).toBe('REDACT');
      expect(cand.confidence).toBeGreaterThanOrEqual(0.9);
      expect(cand.evidence.length).toBeGreaterThanOrEqual(2); // Corroborated with context/proximity
    }
  });

  it('surfaces ambiguous OCR-derived PII to REVIEW rather than silently discarding it', () => {
    const ocrText = 'Patient Contact: +91 98765 4321O (Note: OCR substituted O for 0)';

    const rawCandidates: CandidateInput[] = [
      {
        type: 'PHONE_NUMBER',
        label: 'PHONE',
        value: '+91 98765 4321O',
        startOffset: ocrText.indexOf('+91 98765 4321O'),
        endOffset: ocrText.indexOf('+91 98765 4321O') + '+91 98765 4321O'.length,
        detector: 'OCRFuzzyMatch',
        confidence: 0.65,
        ocrConfidence: 0.72,
        reason: 'Possible OCR digit substitution O->0 with patient context.',
      },
    ];

    const results = EvidenceAggregator.aggregateAndDecide(ocrText, rawCandidates);

    expect(results.length).toBe(1);
    // Crucial requirement: low confidence OCR candidate must NOT be silently dropped (never KEEP)
    expect(results[0].decision).toBe('REVIEW');
    expect(results[0].evidence.some((e) => e.detector === 'OCREngine')).toBe(true);
  });

  it('safely normalizes zero-width non-breaking spaces without altering character positions', () => {
    const textWithZeroWidth = 'Name:\u200B Ananya Krishnan\uFEFF';
    const normalized = EvidenceAggregator.normalizeForMatching(textWithZeroWidth);

    expect(normalized.isModified).toBe(true);
    expect(normalized.normalized.length).toBe(textWithZeroWidth.length); // Preserves exact byte length & offsets
  });
});
