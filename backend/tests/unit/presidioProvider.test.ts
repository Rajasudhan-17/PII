import { PresidioNERProvider } from '../../src/services/pii/ner/presidio.provider';
import { HeuristicNERProvider } from '../../src/services/pii/ner/heuristicNER.provider';
import { PIIType } from '../../src/config/piiTaxonomy';
import { logger } from '../../src/utils/logger';

describe('PresidioNERProvider Unit Tests', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('successfully extracts PERSON entity from mocked Presidio service', async () => {
    const mockEntities = [
      {
        type: 'PERSON',
        start: 0,
        end: 11,
        score: 0.96,
      },
    ];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entities: mockEntities }),
    } as Response);

    const provider = new PresidioNERProvider('http://localhost:8001', { timeoutMs: 1000 });
    const text = 'Alice Smith joined the organization recently.';
    const results = await provider.extractEntities(text);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const personResults = results.filter((r) => r.type === PIIType.PERSON_NAME);
    expect(personResults.length).toBe(1);
    expect(personResults[0].text).toBe('Alice Smith');
    expect(personResults[0].startOffset).toBe(0);
    expect(personResults[0].endOffset).toBe(11);
    expect(personResults[0].confidence).toBe(0.96);
  });

  test('falls back to HeuristicNERProvider when Presidio service times out', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    global.fetch = jest.fn().mockImplementation(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    const fallback = new HeuristicNERProvider();
    const fallbackSpy = jest.spyOn(fallback, 'extractEntities');

    const provider = new PresidioNERProvider('http://localhost:8001', {
      timeoutMs: 50,
      fallbackProvider: fallback,
    });

    const text = 'Mr. John Smith is scheduled for admission.';
    const results = await provider.extractEntities(text);

    expect(fallbackSpy).toHaveBeenCalledWith(text);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.type === PIIType.PERSON_NAME)).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  test('falls back to HeuristicNERProvider when Presidio service returns malformed response', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    // Missing 'entities' array
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ invalid_payload: true }),
    } as Response);

    const fallback = new HeuristicNERProvider();
    const fallbackSpy = jest.spyOn(fallback, 'extractEntities');

    const provider = new PresidioNERProvider('http://localhost:8001', {
      timeoutMs: 1000,
      fallbackProvider: fallback,
    });

    const text = 'Dr. Robert Taylor visited the clinic today.';
    const results = await provider.extractEntities(text);

    expect(fallbackSpy).toHaveBeenCalledWith(text);
    expect(results.some((r) => r.type === PIIType.PERSON_NAME)).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  test('falls back to HeuristicNERProvider when Presidio service returns HTTP 500', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const fallback = new HeuristicNERProvider();
    const fallbackSpy = jest.spyOn(fallback, 'extractEntities');

    const provider = new PresidioNERProvider('http://localhost:8001', {
      timeoutMs: 1000,
      fallbackProvider: fallback,
    });

    const text = 'Contact Ms. Kavitha Nair for assistance.';
    const results = await provider.extractEntities(text);

    expect(fallbackSpy).toHaveBeenCalledWith(text);
    expect(results.some((r) => r.type === PIIType.PERSON_NAME)).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  test('never logs raw PII in warning logs when an error occurs', async () => {
    let capturedLog: unknown = null;
    jest.spyOn(logger, 'warn').mockImplementation((obj: unknown) => {
      capturedLog = obj;
      return logger;
    });

    global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused to NER service'));

    const provider = new PresidioNERProvider('http://localhost:8001');
    const sensitiveName = 'SuperSecretPersonName';
    const text = `The patient name is ${sensitiveName}.`;

    await provider.extractEntities(text);

    expect(capturedLog).toBeDefined();
    const serializedLog = JSON.stringify(capturedLog);
    expect(serializedLog).not.toContain(sensitiveName);
    expect(serializedLog).not.toContain('The patient name is');
  });
});
