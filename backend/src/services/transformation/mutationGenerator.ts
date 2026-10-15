import crypto from 'crypto';
import { PIIType, PIICategory } from '../../config/piiTaxonomy';

export interface MutationContext {
  transformationRunId: string;
  seed: string;
}

export class MutationGenerator {
  private entityMap: Map<string, string> = new Map();

  private syntheticNames = [
    'Alex Carter',
    'Jordan Taylor',
    'Taylor Morgan',
    'Casey Smith',
    'Morgan Reed',
    'Riley Davis',
    'Avery Johnson',
    'Dakota Evans',
    'Reese Miller',
    'Quinn Anderson',
  ];

  private syntheticCities = [
    'Metropolis',
    'Springfield',
    'Riverdale',
    'Fairview',
    'Centerville',
    'Oakland',
  ];

  constructor(private context: MutationContext) {}

  public getSyntheticReplacement(
    rawText: string,
    piiType: PIIType | string,
    category?: PIICategory | string
  ): string {
    const normKey = rawText.trim().toLowerCase();

    // 1. Check existing mapped replacement for entity consistency within run
    if (this.entityMap.has(normKey)) {
      return this.entityMap.get(normKey)!;
    }

    // 2. Credential Safety Invariant: Never mutate security credentials or payment cards into synthetic usable secrets
    const isCredential =
      piiType === PIIType.AUTH_TOKEN_KEY ||
      piiType === PIIType.CREDIT_CARD_NUMBER ||
      category === PIICategory.SECURITY_CREDENTIAL ||
      (piiType as string) === 'API_KEY' ||
      (piiType as string) === 'PRIVATE_KEY';

    if (isCredential) {
      const safeRedaction = '[REDACTED_CREDENTIAL]';
      this.entityMap.set(normKey, safeRedaction);
      return safeRedaction;
    }

    // 3. Generate deterministic index based on hash of seed + rawText
    const hash = crypto
      .createHash('sha256')
      .update(`${this.context.seed}:${normKey}`)
      .digest('hex');
    const hashNum = parseInt(hash.substring(0, 8), 16);

    let replacement = `[MUTATED_${piiType}]`;

    switch (piiType) {
      case PIIType.PERSON_NAME: {
        const nameIdx = hashNum % this.syntheticNames.length;
        replacement = this.syntheticNames[nameIdx];
        break;
      }
      case PIIType.EMAIL_ADDRESS: {
        const userHash = hash.substring(0, 6);
        replacement = `user_${userHash}@example.invalid`;
        break;
      }
      case PIIType.PHONE_NUMBER: {
        const phoneNum = (hashNum % 9000) + 1000;
        replacement = `+1-555-${phoneNum}`;
        break;
      }
      case PIIType.CITY: {
        const cityIdx = hashNum % this.syntheticCities.length;
        replacement = this.syntheticCities[cityIdx];
        break;
      }
      case PIIType.US_SSN: {
        const last4 = (hashNum % 9000) + 1000;
        replacement = `000-00-${last4}`;
        break;
      }
      case PIIType.INDIAN_PAN: {
        const panNum = (hashNum % 9000) + 1000;
        replacement = `ABCDE${panNum}F`;
        break;
      }
      case PIIType.INDIAN_AADHAAR: {
        const aadhaarNum = (hashNum % 9000) + 1000;
        replacement = `0000 0000 ${aadhaarNum}`;
        break;
      }
      case PIIType.IBAN: {
        const ibanNum = (hashNum % 900000) + 100000;
        replacement = `GB00XXXX00000000${ibanNum}`;
        break;
      }
      case PIIType.POSTAL_ADDRESS: {
        replacement = '100 Synthetic Way, Suite 100';
        break;
      }
      default: {
        replacement = `[MUTATED_${piiType.toUpperCase()}]`;
      }
    }

    this.entityMap.set(normKey, replacement);
    return replacement;
  }
}
