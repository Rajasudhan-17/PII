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

const PRODUCT_AND_BUSINESS_BLACKLIST = new Set([
  'kindle paperwhite',
  'amazon kindle',
  'apple watch',
  'apple watch ultra',
  'ipad pro',
  'iphone',
  'macbook',
  'corporate expense',
  'delaware court',
  'product manager',
  'diagnostic equipment',
  'income tax',
  'total amount',
  'swift network',
  'terms and conditions',
  'offer letter',
  'employment offer',
  'customer support',
  'human resources',
  'health insurance',
  'code conduct',
  'billing reference',
  'quarterly review',
  'customer success',
  'full name',
  'badge id',
  'badge number',
  'clinical intake',
  'employee badge',
  'patient clinical intake',
  'mount everest expedition',
]);

const STREET_OR_LOCATION_SUFFIXES = /\b(?:Avenue|Ave|Road|Rd|Street|St|Lane|Ln|Boulevard|Blvd|Drive|Dr|Court|Ct|Salai|Nagar|Marg|Sector|Highway|Hwy|Circle|Place|Pl)\b/i;

export function cleanAndValidatePersonName(
  text: string,
  start: number,
  end: number,
  fullText: string
): { text: string; start: number; end: number } | null {
  let candidateText = text;
  let candidateStart = start;
  let candidateEnd = end;

  // 1. Reject if candidate contains email symbols or newlines
  if (candidateText.includes('@') || candidateText.includes('.example') || candidateText.includes('.com')) {
    return null;
  }
  if (/[\r\n]/.test(candidateText)) {
    return null;
  }

  // 2. Reject if candidate is followed by email obfuscation tags like " [at] " or " (at) " or " @"
  const following = fullText.slice(candidateEnd, candidateEnd + 15);
  if (/^\s*(?:\[at\]|\(at\)|@)/i.test(following)) {
    return null;
  }

  // 3. Reject if preceded by email label
  const preceding = fullText.slice(Math.max(0, candidateStart - 30), candidateStart);
  if (/(?:secondary\s+email|contact\s+email|applicant\s+email|email|e-mail)[:\s]+$/i.test(preceding)) {
    return null;
  }

  // 4. Strip leading labels (e.g. "Contact ", "Signatory ", "Witness ")
  const leadMatch = candidateText.match(/^(?:Contact|Direct Contact|Signatory|Witness|Reporting Manager|Employee|Applicant|Candidate|Client|Patient|Physician|Name|Full Name|Customer Name)[:\s-]+/i);
  if (leadMatch) {
    candidateStart += leadMatch[0].length;
    candidateText = candidateText.slice(leadMatch[0].length);
  }

  // 5. Strip trailing verbs (e.g. " was", " is", " has", " joined")
  const trailMatch = candidateText.match(/\s+(?:was|is|has|had|joined|resigned|reported|visited|received|contacted|called|scheduled|stated|confirmed)\b.*$/i);
  if (trailMatch) {
    candidateEnd -= trailMatch[0].length;
    candidateText = candidateText.slice(0, candidateText.length - trailMatch[0].length);
  }

  // 6. Strip trailing punctuation
  const punctMatch = candidateText.match(/[.,;:!?-]+$/);
  if (punctMatch) {
    candidateEnd -= punctMatch[0].length;
    candidateText = candidateText.slice(0, candidateText.length - punctMatch[0].length);
  }

  candidateText = candidateText.trim();
  if (candidateText.length < 2) {
    return null;
  }

  const lower = candidateText.toLowerCase();

  // 7. Reject known product / corporate terms
  if (PRODUCT_AND_BUSINESS_BLACKLIST.has(lower)) {
    return null;
  }

  // 8. Reject street/address names (e.g. "Oak Avenue", "Gandhi Road", "Anna Salai")
  if (STREET_OR_LOCATION_SUFFIXES.test(candidateText)) {
    return null;
  }

  return {
    text: candidateText,
    start: candidateStart,
    end: candidateEnd,
  };
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

      // 1. Extract fallback entities first so we know what composite addresses exist
      const fallbackEntities = await this.fallbackProvider.extractEntities(text);
      const postalAddresses = fallbackEntities.filter((e) => e.type === PIIType.POSTAL_ADDRESS);
      const nonPersonFallbacks = fallbackEntities.filter((e) => e.type !== PIIType.PERSON_NAME);
      const contextualPersonFallbacks = fallbackEntities.filter((e) => e.type === PIIType.PERSON_NAME && e.confidence >= 0.94);

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
          const validated = cleanAndValidatePersonName(entityText, item.start, item.end, text);
          if (validated) {
            entities.push({
              type: PIIType.PERSON_NAME,
              text: validated.text,
              startOffset: validated.start,
              endOffset: validated.end,
              confidence: Math.min(1.0, Math.max(0.1, item.score)),
            });
          }
        } else if (item.type === 'LOCATION') {
          // If this location is inside or overlapping an existing postal address, do not fragment it
          const overlapsAddress = postalAddresses.some(
            (addr) => item.start < addr.endOffset && item.end > addr.startOffset
          );
          if (overlapsAddress) {
            continue;
          }

          // Check if explicit address context precedes this location
          const precedingContext = text.slice(Math.max(0, item.start - 40), item.start);
          const hasAddressContext = /(?:address|location|residence|billing|shipping)\s*[:=-]\s*$/i.test(precedingContext);
          if (hasAddressContext) {
            entities.push({
              type: PIIType.POSTAL_ADDRESS,
              text: entityText,
              startOffset: item.start,
              endOffset: item.end,
              confidence: Math.min(1.0, Math.max(0.1, item.score)),
            });
          }
          // Otherwise, isolated city/location mentions are non-PII geographic references (controlling FP)
        }
      }

      for (const cp of contextualPersonFallbacks) {
        const overlaps = entities.some((ex) => cp.startOffset < ex.endOffset && cp.endOffset > ex.startOffset);
        if (!overlaps) {
          const validated = cleanAndValidatePersonName(cp.text, cp.startOffset, cp.endOffset, text);
          if (validated) {
            entities.push({
              type: PIIType.PERSON_NAME,
              text: validated.text,
              startOffset: validated.start,
              endOffset: validated.end,
              confidence: cp.confidence,
            });
          }
        }
      }

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
