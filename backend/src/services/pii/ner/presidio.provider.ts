import { INERProvider, INEREntity } from './ner.interface';
import { PIIType } from '../../../config/piiTaxonomy';
import { HeuristicNERProvider } from './heuristicNER.provider';
import { logger } from '../../../utils/logger';

export interface PresidioNERProviderOptions {
  timeoutMs?: number;
  fallbackProvider?: INERProvider;
}

interface PresidioEntityResponse {
  type: string;
  start: number;
  end: number;
  score: number;
  text?: string;
}

interface PresidioAnalyzeResponse {
  entities?: PresidioEntityResponse[];
}

export class PresidioNERProvider implements INERProvider {
  public readonly name = 'PresidioNERProvider';
  public readonly supportedTypes: PIIType[] = [
    PIIType.PERSON_NAME,
    PIIType.POSTAL_ADDRESS,
    PIIType.CITY,
    PIIType.DATE_OF_BIRTH,
    PIIType.UNKNOWN_PII,
  ];

  private readonly serviceUrl: string;
  private readonly timeoutMs: number;
  private readonly fallbackProvider: INERProvider;

  constructor(serviceUrl?: string, options?: PresidioNERProviderOptions) {
    this.serviceUrl = (serviceUrl || process.env.NER_SERVICE_URL || 'http://localhost:8001').replace(/\/+$/, '');
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.fallbackProvider = options?.fallbackProvider ?? new HeuristicNERProvider();
  }

  public async extractEntities(text: string): Promise<INEREntity[]> {
    if (!text || !text.trim()) {
      return [];
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await fetch(`${this.serviceUrl}/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            language: 'en',
            score_threshold: 0.4,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`Presidio NER service returned HTTP status ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as PresidioAnalyzeResponse;
      if (!data || !Array.isArray(data.entities)) {
        throw new Error('Presidio NER service returned malformed payload (missing entities array)');
      }

      const entities: INEREntity[] = [];
      for (const item of data.entities) {
        if (
          typeof item.start !== 'number' ||
          typeof item.end !== 'number' ||
          typeof item.score !== 'number' ||
          item.start < 0 ||
          item.end > text.length ||
          item.start >= item.end
        ) {
          continue;
        }

        const entityText = text.slice(item.start, item.end);
        if (item.type === 'PERSON') {
          entities.push({
            type: PIIType.PERSON_NAME,
            text: entityText,
            startOffset: item.start,
            endOffset: item.end,
            confidence: Math.min(1.0, Math.max(0.1, item.score)),
          });
        } else if (item.type === 'LOCATION') {
          entities.push({
            type: PIIType.CITY,
            text: entityText,
            startOffset: item.start,
            endOffset: item.end,
            confidence: Math.min(1.0, Math.max(0.1, item.score)),
          });
        }
      }

      // Preserve non-PERSON extractions (e.g. DOB, Address) from fallback provider
      // so recall does not drop before dedicated parsers are implemented in Phase 4
      const fallbackEntities = await this.fallbackProvider.extractEntities(text);
      const nonPersonFallbacks = fallbackEntities.filter((e) => e.type !== PIIType.PERSON_NAME);

      return [...entities, ...nonPersonFallbacks];
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // NEVER log raw PII or user text - only log operational status and error message
      logger.warn(
        {
          provider: this.name,
          serviceUrl: this.serviceUrl,
          error: errorMessage,
        },
        'Presidio NER service call failed or timed out. Falling back to HeuristicNERProvider.'
      );

      return this.fallbackProvider.extractEntities(text);
    }
  }
}
