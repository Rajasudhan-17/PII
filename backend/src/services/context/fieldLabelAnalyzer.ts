import {
  CONTEXT_FIELD_LABELS,
  SemanticRole,
} from '../../config/contextTaxonomy';
import { IContextSignal } from '../../models/contextResult.model';

export interface FieldLabelAnalysisResult {
  fieldLabel: string | null;
  detectedRole: SemanticRole;
  positiveSignals: IContextSignal[];
  negativeSignals: IContextSignal[];
  nearbyKeywords: string[];
}

export class FieldLabelAnalyzer {
  public static analyze(
    windowText: string,
    candidateType: string,
    columnHeader?: string
  ): FieldLabelAnalysisResult {
    const lowerWindow = windowText.toLowerCase();
    const lowerHeader = (columnHeader || '').toLowerCase();
    const positiveSignals: IContextSignal[] = [];
    const negativeSignals: IContextSignal[] = [];
    let fieldLabel: string | null = null;
    let detectedRole: SemanticRole = 'UNKNOWN';
    const nearbyKeywordsSet = new Set<string>();

    // Collect all keyword matches to prioritize longer, more specific matches
    interface MatchCandidate {
      keyword: string;
      role: SemanticRole;
      key: string;
      isHeaderMatch: boolean;
    }

    const matches: MatchCandidate[] = [];

    // 1. Column header check if in table
    if (lowerHeader) {
      for (const [key, pattern] of Object.entries(CONTEXT_FIELD_LABELS)) {
        for (const posKw of pattern.positiveKeywords) {
          if (lowerHeader.includes(posKw)) {
            matches.push({
              keyword: posKw,
              role: pattern.role,
              key,
              isHeaderMatch: true,
            });
          }
        }
      }
    }

    // 2. Lexical keyword matching in context window
    for (const [key, pattern] of Object.entries(CONTEXT_FIELD_LABELS)) {
      // Check negative keywords first
      for (const negKw of pattern.negativeKeywords) {
        if (lowerWindow.includes(negKw)) {
          negativeSignals.push({
            signalType: 'NEGATIVE_CONTEXT_SIGNAL',
            weight: 0.4,
            provenance: `Context window contains negative keyword '${negKw}'`,
            description: `Context indicates example/dummy/test data`,
          });
        }
      }

      // Check positive keywords
      for (const posKw of pattern.positiveKeywords) {
        const labelRegex = new RegExp(`(?:${posKw})\\s*[:=\\-]\\s*`, 'i');
        if (labelRegex.test(lowerWindow) || lowerWindow.includes(posKw)) {
          matches.push({
            keyword: posKw,
            role: pattern.role,
            key,
            isHeaderMatch: false,
          });
        }
      }
    }

    // Sort matches by keyword length descending so longer keywords (e.g. 'email address') take precedence
    matches.sort((a, b) => b.keyword.length - a.keyword.length);

    if (matches.length > 0) {
      const topMatch = matches[0];
      fieldLabel = topMatch.isHeaderMatch ? (columnHeader || topMatch.keyword) : topMatch.keyword;
      detectedRole = topMatch.role;

      for (const m of matches) {
        nearbyKeywordsSet.add(m.keyword);
        positiveSignals.push({
          signalType: m.isHeaderMatch ? 'TABLE_HEADER_MATCH' : 'FIELD_LABEL_MATCH',
          weight: m.isHeaderMatch ? 0.4 : 0.35,
          provenance: m.isHeaderMatch
            ? `Table column header contains '${m.keyword}'`
            : `Context window contains label '${m.keyword}'`,
          description: `Matches ${m.key} pattern`,
        });
      }
    }

    // 3. Fallback role inference based on candidate PII Type if unknown
    if (detectedRole === 'UNKNOWN') {
      switch (candidateType) {
        case 'EMAIL_ADDRESS':
        case 'PHONE_NUMBER':
          detectedRole = 'CONTACT_FIELD';
          break;
        case 'CREDIT_CARD_NUMBER':
        case 'IBAN':
        case 'BANK_ACCOUNT':
          detectedRole = 'FINANCIAL_FIELD';
          break;
        case 'US_SSN':
        case 'INDIAN_PAN':
        case 'INDIAN_AADHAAR':
        case 'PASSPORT_NUMBER':
          detectedRole = 'IDENTIFIER_FIELD';
          break;
        case 'AUTH_TOKEN_KEY':
          detectedRole = 'SECURITY_CREDENTIAL_FIELD';
          break;
        default:
          detectedRole = 'FREE_TEXT';
          break;
      }
    }

    return {
      fieldLabel,
      detectedRole,
      positiveSignals,
      negativeSignals,
      nearbyKeywords: Array.from(nearbyKeywordsSet),
    };
  }
}
