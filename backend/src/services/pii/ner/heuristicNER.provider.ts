import { INERProvider, INEREntity } from './ner.interface';
import { PIIType } from '../../../config/piiTaxonomy';
import { isKnownCity, isKnownState } from '../data/gazetteer';

export class HeuristicNERProvider implements INERProvider {
  public name = 'HeuristicNERProvider';
  public supportedTypes = [
    PIIType.PERSON_NAME,
    PIIType.DATE_OF_BIRTH,
    PIIType.POSTAL_ADDRESS,
    PIIType.CITY,
    PIIType.UNKNOWN_PII,
  ];

  private PERSON_REGEX = /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)[^\S\r\n]+[A-Z][a-z]+(?:[^\S\r\n]+[A-Z][a-z]+){1,2}\b|\b[A-Z][a-z]+[^\S\r\n]+[A-Z][a-z]+\b/g;
  private CONTEXTUAL_PERSON_REGEX =
    /(?:(?:Dear|Sincerely|Regards)\s+|(?:Candidate|Employee|Applicant|Patient|Client|Signatory|Witness|Doctor)?\s*(?:Full\s+)?(?:Name|Account\s+Holder|Reported\s+By|Physician|Doctor|Reporting\s+Manager|Authorized\s+Representative)\s*[:=-]\s*)([a-zA-Z]+(?:[^\S\r\n]+[a-zA-Z]+){1,2})\b/gi;

  // Extended DOB patterns with strict DOB context:
  // 1. Numeric: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  // 2. Ordinal Day-First: 24th Nov 1992, 17th Aug 1988, 3rd March 1995, 17 August 1988
  // 3. Month-First: August 17, 1988, November 24, 1992, March 3rd, 1995
  private DOB_PATTERN =
    /\b(?:DOB|Date\s+of\s+Birth|D\.O\.B\.|Born(?:\s+on)?|Birthdate|Birth\s+Date)[:\s=]+((?:\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[a-z]*[,\s]+\d{4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}))\b/gi;

  // Explicit address labels capturing the entire composite address line
  private ADDR_LABEL_REGEX =
    /(?:Residential\s+Address|Billing\s+Location|Billing\s+Address|Shipping\s+Address|Mailing\s+Address|Permanent\s+Address|Current\s+Address|Street\s+Address|Home\s+Address|Office\s+Address|Postal\s+Address|Address|Location)\s*[:=-]\s*([^\n\r]+)/gi;

  // Structural US/Global composite address (e.g. "240 Washington Boulevard, San Francisco")
  private US_COMPOSITE_ADDR_REGEX =
    /\b(\d{1,5}\s+(?:[A-Z][a-zA-Z0-9#.\s]{2,30})\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Circle|Cir)\b(?:,\s*[A-Za-z\s]+?(?:,?\s*[A-Z]{2}?\s*\d{5}(?:-\d{4})?)?)?)/gi;

  // Structural Indian composite address (e.g. "28/10 Vashi Sector 17, Kolkata 573935")
  private INDIAN_COMPOSITE_ADDR_REGEX =
    /\b(\d{1,4}(?:\/\d{1,4})?\s*,?\s+[A-Za-z0-9#.\s-]{2,45}?(?:Road|Rd|Street|St|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Sector\s+\d+|Block(?:\s+\d+[a-zA-Z]*)?|Cross|Main|Nagar|Salai|Colony|Marg|Layout)\b(?:[^\n\r,]*),\s*[A-Za-z\s]+?(?:\s+\d{6})?)\b/gi;

  private REF_ID_REGEX = /\b(?:Patient\s+(?:Ref|Reference|ID)|MRN|Record\s+Number|Account\s+Number)[:\s]+([A-Z0-9_-]{4,20})\b/gi;

  private BUSINESS_EXCLUSIONS = new Set([
    'microsoft corporation', 'john smith llp', 'smith & associates', 'northwind traders',
    'terms and conditions', 'offer letter', 'employment offer', 'data analyst',
    'software engineer', 'product manager', 'head people', 'human resources',
    'customer support', 'united states', 'new york', 'san francisco', 'credit card',
    'social security', 'date birth', 'annual leave', 'health insurance', 'code conduct'
  ]);

  private ORG_SUFFIXES = new Set([
    'llp', 'inc', 'inc.', 'corp', 'corp.', 'corporation', 'ltd', 'ltd.', 'limited',
    'company', 'co.', 'group', 'bank', 'technologies', 'solutions', 'enterprises',
    'holdings', 'services', 'gmbh', 'plc', 'associates', 'system', 'systems',
    'network', 'healthcare', 'hospital', 'clinic', 'center', 'centre', 'agency'
  ]);

  public async extractEntities(text: string): Promise<INEREntity[]> {
    const entities: INEREntity[] = [];
    if (!text) return entities;

    // 1. High-Confidence Contextual Person Names
    let cMatch: RegExpExecArray | null;
    this.CONTEXTUAL_PERSON_REGEX.lastIndex = 0;
    while ((cMatch = this.CONTEXTUAL_PERSON_REGEX.exec(text)) !== null) {
      const nameVal = cMatch[1].trim();
      const lowerName = nameVal.toLowerCase();
      if (!this.BUSINESS_EXCLUSIONS.has(lowerName)) {
        const offsetDelta = cMatch[0].lastIndexOf(nameVal);
        entities.push({
          type: PIIType.PERSON_NAME,
          text: nameVal,
          startOffset: cMatch.index + offsetDelta,
          endOffset: cMatch.index + offsetDelta + nameVal.length,
          confidence: 0.94,
        });
      }
    }

    // 2. Person Names with Salutations or Name Patterns
    let match: RegExpExecArray | null;
    this.PERSON_REGEX.lastIndex = 0;
    const commonWords = new Set([
      'The', 'This', 'That', 'With', 'From', 'Have', 'They', 'Your', 'Their', 'Note',
      'Page', 'Item', 'Date', 'Type', 'Name', 'City', 'Road', 'Code', 'File', 'User',
      'Terms', 'Conditions', 'Employment', 'Offer', 'Data', 'Analyst', 'Northwind', 'Traders',
      'Billing', 'Reference', 'Diagnostic', 'Equipment', 'Facility', 'Hospital', 'Registration',
      'Department', 'Inquiries', 'Public', 'General', 'Admission', 'Summary', 'Clinical',
      'Record', 'Records', 'Administrative', 'Commercial', 'System', 'Service', 'Services', 'Desk', 'Office'
    ]);

    while ((match = this.PERSON_REGEX.exec(text)) !== null) {
      const matchText = match[0];
      const matchIdx = match.index;
      const lowerMatch = matchText.toLowerCase();

      // Skip already matched contextual names
      if (entities.some((e) => e.startOffset <= matchIdx && e.endOffset >= matchIdx + matchText.length)) {
        continue;
      }

      // Skip field labels / headers ending with a colon (e.g. "Billing Reference:", "Facility Name:")
      if (text.slice(matchIdx + matchText.length).trimStart().startsWith(':')) {
        continue;
      }

      // Skip known business exclusions
      if (this.BUSINESS_EXCLUSIONS.has(lowerMatch)) {
        continue;
      }

      // Check organization suffix in the surrounding 20 chars
      const afterMatch = text.slice(match.index + matchText.length, match.index + matchText.length + 20).toLowerCase();
      const hasOrgSuffix = Array.from(this.ORG_SUFFIXES).some((sfx) => new RegExp(`^\\s+${sfx}\\b`, 'i').test(afterMatch));
      if (hasOrgSuffix) {
        continue;
      }

      const words = matchText.split(/\s+/);
      if (words.some((w) => commonWords.has(w))) {
        continue;
      }

      const hasTitle = matchText.startsWith('Mr.') || matchText.startsWith('Dr.') || matchText.startsWith('Mrs.') || matchText.startsWith('Ms.');
      entities.push({
        type: PIIType.PERSON_NAME,
        text: matchText,
        startOffset: match.index,
        endOffset: match.index + matchText.length,
        confidence: hasTitle ? 0.92 : 0.68,
      });
    }

    // 3. Date of Birth (requiring strict DOB context)
    this.DOB_PATTERN.lastIndex = 0;
    while ((match = this.DOB_PATTERN.exec(text)) !== null) {
      const targetText = match[1].trim();
      const offsetDelta = match[0].indexOf(targetText);
      const start = match.index + offsetDelta;
      const end = start + targetText.length;

      entities.push({
        type: PIIType.DATE_OF_BIRTH,
        text: targetText,
        startOffset: start,
        endOffset: end,
        confidence: 0.95,
      });
    }

    // 4. Postal Address
    const addressSpans: Array<{ start: number; end: number; text: string; confidence: number }> = [];

    // 4a. Explicit Address Labels (e.g. "Residential Address: 28/10 Vashi Sector 17, Kolkata 573935")
    this.ADDR_LABEL_REGEX.lastIndex = 0;
    while ((match = this.ADDR_LABEL_REGEX.exec(text)) !== null) {
      const rawVal = match[1].trim();
      if (!rawVal) continue;

      // Validate address indicators in the extracted line:
      // Must contain numbers, locality/road indicator or known city/state/pincode
      const hasNumber = /\d+/.test(rawVal);
      const hasLocality =
        /\b(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Sector|Block|Cross|Main|Nagar|Salai|Colony|Marg|Layout|Park|Plaza|Floor|Flat|Door|Apartment|Tower)\b/i.test(
          rawVal
        );
      const words = rawVal.split(/[,\s]+/);
      const hasCityOrState = words.some((w) => isKnownCity(w) || isKnownState(w));
      const hasPinOrZip = /\b\d{5,6}\b/.test(rawVal);

      if (hasNumber && (hasLocality || hasCityOrState || hasPinOrZip)) {
        const offsetDelta = match[0].indexOf(rawVal);
        const start = match.index + offsetDelta;
        const end = start + rawVal.length;

        addressSpans.push({
          start,
          end,
          text: rawVal,
          confidence: 0.95,
        });
      }
    }

    // 4b. Structural US / Global Composite Addresses
    this.US_COMPOSITE_ADDR_REGEX.lastIndex = 0;
    while ((match = this.US_COMPOSITE_ADDR_REGEX.exec(text)) !== null) {
      const matchText = match[1].trim();
      const start = match.index;
      const end = start + matchText.length;

      // Check if already captured in a larger span
      const alreadyCaptured = addressSpans.some((a) => a.start <= start && a.end >= end);
      if (!alreadyCaptured) {
        addressSpans.push({
          start,
          end,
          text: matchText,
          confidence: 0.9,
        });
      }
    }

    // 4c. Structural Indian Composite Addresses
    this.INDIAN_COMPOSITE_ADDR_REGEX.lastIndex = 0;
    while ((match = this.INDIAN_COMPOSITE_ADDR_REGEX.exec(text)) !== null) {
      const matchText = match[1].trim();
      const start = match.index;
      const end = start + matchText.length;

      const alreadyCaptured = addressSpans.some((a) => a.start <= start && a.end >= end);
      if (!alreadyCaptured) {
        addressSpans.push({
          start,
          end,
          text: matchText,
          confidence: 0.9,
        });
      }
    }

    // Push unified postal address entities
    for (const addr of addressSpans) {
      entities.push({
        type: PIIType.POSTAL_ADDRESS,
        text: addr.text,
        startOffset: addr.start,
        endOffset: addr.end,
        confidence: addr.confidence,
      });
    }

    // 5. Reference / Identifier
    this.REF_ID_REGEX.lastIndex = 0;
    while ((match = this.REF_ID_REGEX.exec(text)) !== null) {
      const idVal = match[1];
      const offsetDelta = match[0].indexOf(idVal);
      entities.push({
        type: PIIType.UNKNOWN_PII,
        text: idVal,
        startOffset: match.index + offsetDelta,
        endOffset: match.index + offsetDelta + idVal.length,
        confidence: 0.85,
      });
    }

    return entities;
  }
}
