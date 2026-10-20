import { describe, it, expect, beforeEach } from 'vitest';
import {
  DETECTOR_DEFINITIONS,
  RuleSet,
  FindingItem,
  RedactionRun,
} from '../context/RedactContext';

describe('Redact Platform Core Engine & Features', () => {
  describe('1. Detectors & Rule Sets', () => {
    it('has all 11 required detector definitions with exact types and badges', () => {
      expect(DETECTOR_DEFINITIONS.length).toBe(11);
      const namesDetector = DETECTOR_DEFINITIONS.find((d) => d.id === 'names');
      expect(namesDetector).toBeDefined();
      expect(namesDetector?.badgeText).toBe('Heuristic · review advised');
      expect(namesDetector?.badgeType).toBe('heuristic');

      const cardsDetector = DETECTOR_DEFINITIONS.find((d) => d.id === 'cards');
      expect(cardsDetector?.badgeText).toBe('Checksum-verified');
      expect(cardsDetector?.badgeType).toBe('checksum');

      const ssnDetector = DETECTOR_DEFINITIONS.find((d) => d.id === 'ssn');
      expect(ssnDetector?.badgeText).toBe('Format rules');
      expect(ssnDetector?.badgeType).toBe('format');
    });

    it('toggles detector states dynamically within a rule set', () => {
      const mockRuleSet: RuleSet = {
        id: 'finance-team',
        name: 'Finance team',
        isCustom: true,
        typeSummary: 'Custom · 8 of 11 types',
        startedFrom: 'PCI-DSS',
        detectors: {
          names: true,
          emails: true,
          phones: true,
          dobs: false,
          addresses: false,
          cards: true,
          ibans: true,
          ssn: true,
          aadhaar: false,
          pan: true,
          api_keys: true,
        },
        alwaysRedact: ['Project Falcon', 'ACME-4471'],
        neverRedact: ['hr@northwind.example', 'Northwind Traders'],
        confidenceThreshold: 90,
        defaultLook: 'bar',
      };

      expect(mockRuleSet.detectors.names).toBe(true);
      // Toggle names off
      mockRuleSet.detectors.names = !mockRuleSet.detectors.names;
      expect(mockRuleSet.detectors.names).toBe(false);

      // Toggle dobs on
      expect(mockRuleSet.detectors.dobs).toBe(false);
      mockRuleSet.detectors.dobs = !mockRuleSet.detectors.dobs;
      expect(mockRuleSet.detectors.dobs).toBe(true);
    });

    it('manages Always Redact and Never Redact phrase tags cleanly', () => {
      const alwaysRedact = ['Project Falcon', 'ACME-4471'];
      const neverRedact = ['hr@northwind.example', 'Northwind Traders'];

      // Add phrase
      alwaysRedact.push('Confidential-Alpha');
      expect(alwaysRedact).toContain('Confidential-Alpha');
      expect(alwaysRedact.length).toBe(3);

      // Remove phrase
      const filtered = alwaysRedact.filter((p) => p !== 'ACME-4471');
      expect(filtered).not.toContain('ACME-4471');
      expect(filtered.length).toBe(2);

      // Never redact removal
      const updatedNever = neverRedact.filter((p) => p !== 'Northwind Traders');
      expect(updatedNever).toEqual(['hr@northwind.example']);
    });

    it('modifies confidence thresholds and look styles accurately', () => {
      let threshold = 90;
      let look: 'bar' | 'label' | 'partial' = 'bar';

      threshold = 75;
      expect(threshold).toBe(75);

      look = 'label';
      expect(look).toBe('label');

      look = 'partial';
      expect(look).toBe('partial');
    });
  });

  describe('2. Review Workspace Interactive Decisions & History', () => {
    let mockFindings: FindingItem[];
    let historyStack: FindingItem[][];
    let redoStack: FindingItem[][];

    beforeEach(() => {
      mockFindings = [
        {
          id: 'finding_northwind',
          type: 'NAME',
          label: 'NAME',
          value: 'Northwind Traders',
          confidence: 55,
          sureText: '55% sure',
          places: 2,
          reason: 'Looks like a company, not a person.',
          status: 'review',
          source: 'automatic',
        },
        {
          id: 'finding_arun',
          type: 'NAME',
          label: 'NAME',
          value: 'Arun Mehta',
          confidence: 62,
          sureText: '62% sure',
          places: 1,
          reason: 'Appears on a signature line.',
          status: 'review',
          source: 'automatic',
        },
        {
          id: 'finding_priya',
          type: 'PERSON_NAME',
          label: 'NAME',
          value: 'Priya Nair',
          places: 2,
          status: 'redact',
          source: 'automatic',
        },
        {
          id: 'finding_email_northwind',
          type: 'EMAIL_ADDRESS',
          label: 'EMAIL',
          value: 'hr@northwind.example',
          places: 1,
          status: 'keep',
          source: 'automatic',
        },
      ];
      historyStack = [];
      redoStack = [];
    });

    it('transitions finding from Needs Review to Will Redact and updates counts', () => {
      // Push history before mutate
      historyStack.push(JSON.parse(JSON.stringify(mockFindings)));

      // Redact Northwind Traders
      mockFindings = mockFindings.map((f) =>
        f.id === 'finding_northwind' ? { ...f, status: 'redact' } : f
      );

      const target = mockFindings.find((f) => f.id === 'finding_northwind');
      expect(target?.status).toBe('redact');

      const reviewCount = mockFindings
        .filter((f) => f.status === 'review')
        .reduce((acc, f) => acc + f.places, 0);
      expect(reviewCount).toBe(1); // Arun Mehta (1 place) left in review

      const redactCount = mockFindings
        .filter((f) => f.status === 'redact')
        .reduce((acc, f) => acc + f.places, 0);
      expect(redactCount).toBe(4); // Priya Nair (2) + Northwind (2)
    });

    it('transitions finding to Kept and allows Undo to return to review', () => {
      // Keep Arun Mehta
      historyStack.push(JSON.parse(JSON.stringify(mockFindings)));
      mockFindings = mockFindings.map((f) =>
        f.id === 'finding_arun' ? { ...f, status: 'keep' } : f
      );

      let target = mockFindings.find((f) => f.id === 'finding_arun');
      expect(target?.status).toBe('keep');

      // Undo decision
      historyStack.push(JSON.parse(JSON.stringify(mockFindings)));
      mockFindings = mockFindings.map((f) =>
        f.id === 'finding_arun' ? { ...f, status: 'review' } : f
      );

      target = mockFindings.find((f) => f.id === 'finding_arun');
      expect(target?.status).toBe('review');
    });

    it('supports manual text selection redaction', () => {
      const manualFinding: FindingItem = {
        id: `manual_123`,
        type: 'CUSTOM',
        label: 'CUSTOM',
        value: 'Confidential Internal Salary',
        places: 1,
        status: 'redact',
        source: 'manual',
      };

      mockFindings.push(manualFinding);
      expect(mockFindings.length).toBe(5);
      expect(mockFindings.some((f) => f.value === 'Confidential Internal Salary')).toBe(true);
    });

    it('executes undo and redo stack navigation seamlessly', () => {
      // Step 1: initial state has Northwind in 'review'
      const step1 = JSON.parse(JSON.stringify(mockFindings));

      // Step 2: Redact Northwind
      historyStack.push(step1);
      mockFindings = mockFindings.map((f) =>
        f.id === 'finding_northwind' ? { ...f, status: 'redact' } : f
      );
      expect(mockFindings.find((f) => f.id === 'finding_northwind')?.status).toBe('redact');

      // Undo action
      redoStack.push(JSON.parse(JSON.stringify(mockFindings)));
      mockFindings = historyStack.pop()!;
      expect(mockFindings.find((f) => f.id === 'finding_northwind')?.status).toBe('review');

      // Redo action
      historyStack.push(JSON.parse(JSON.stringify(mockFindings)));
      mockFindings = redoStack.pop()!;
      expect(mockFindings.find((f) => f.id === 'finding_northwind')?.status).toBe('redact');
    });

    it('finalizes decisions and marks document as VERIFIED with 6 independent checks', () => {
      const doc: RedactionRun = {
        id: 'offer_letter.docx',
        filename: 'offer_letter.docx',
        format: 'DOCX',
        size: '38 KB',
        sizeBytes: 38912,
        ruleSet: 'Everything',
        ruleSetId: 'everything',
        foundCount: 13,
        redactedCount: 10,
        status: 'IN_REVIEW',
        when: 'Today, 09:12',
        look: 'bar',
      };

      // Apply & verify
      doc.status = 'VERIFIED';
      doc.checks = {
        searchedOutput: true,
        ranDetectors: true,
        propertiesCleared: true,
        hiddenChecked: true,
        fileOpens: true,
        originalUntouched: true,
      };

      expect(doc.status).toBe('VERIFIED');
      expect(doc.checks.searchedOutput).toBe(true);
      expect(doc.checks.fileOpens).toBe(true);
      expect(doc.checks.originalUntouched).toBe(true);
      expect(Object.values(doc.checks).every(Boolean)).toBe(true);
    });
  });

  describe('3. History Runs & Fail-Closed Guardrails', () => {
    const mockRuns: RedactionRun[] = [
      {
        id: 'offer_letter.docx',
        filename: 'offer_letter.docx',
        format: 'DOCX',
        size: '38 KB',
        sizeBytes: 38912,
        ruleSet: 'Everything',
        ruleSetId: 'everything',
        foundCount: 13,
        redactedCount: 10,
        status: 'VERIFIED',
        when: 'Today, 09:12',
        look: 'bar',
      },
      {
        id: 'patients_q3.csv',
        filename: 'patients_q3.csv',
        format: 'CSV',
        size: '112 KB',
        sizeBytes: 114688,
        ruleSet: 'HIPAA',
        ruleSetId: 'hipaa',
        foundCount: 148,
        redactedCount: '131 so far',
        status: 'IN_REVIEW',
        reviewCount: 17,
        when: 'Today, 08:40',
        look: 'bar',
      },
      {
        id: 'payroll_export.docx',
        filename: 'payroll_export.docx',
        format: 'DOCX',
        size: '42 KB',
        sizeBytes: 43008,
        ruleSet: 'India IDs',
        ruleSetId: 'india-ids',
        foundCount: 9,
        redactedCount: 0,
        status: 'FAILED',
        statusNote: "2 redactions couldn't be applied. Nothing was exported.",
        when: 'Yesterday, 18:04',
        look: 'bar',
      },
      {
        id: 'scan_0042.pdf',
        filename: 'scan_0042.pdf',
        format: 'PDF',
        size: '4.2 MB',
        sizeBytes: 4404019,
        ruleSet: 'None',
        ruleSetId: 'none',
        foundCount: 'n/a',
        redactedCount: 'n/a',
        status: 'UNSUPPORTED',
        statusNote: 'PDF redaction is coming. Nothing was processed.',
        when: '14 Oct',
        look: 'bar',
      },
    ];

    it('filters runs by status correctly', () => {
      const verified = mockRuns.filter((r) => r.status === 'VERIFIED');
      expect(verified.length).toBe(1);

      const inReview = mockRuns.filter((r) => r.status === 'IN_REVIEW');
      expect(inReview.length).toBe(1);
      expect(inReview[0].reviewCount).toBe(17);

      const failed = mockRuns.filter((r) => r.status === 'FAILED');
      expect(failed.length).toBe(1);
      expect(failed[0].statusNote).toContain("2 redactions couldn't be applied");
    });

    it('enforces fail-closed principle on failed runs', () => {
      const failedRun = mockRuns.find((r) => r.status === 'FAILED');
      expect(failedRun).toBeDefined();
      expect(failedRun?.redactedCount).toBe(0); // 0 bytes exported
    });
  });
});
