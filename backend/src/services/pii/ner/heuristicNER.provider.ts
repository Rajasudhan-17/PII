import { INERProvider, INEREntity } from './ner.interface';
import { PIIType } from '../../../config/piiTaxonomy';

export class HeuristicNERProvider implements INERProvider {
  public name = 'HeuristicNERProvider';
  public supportedTypes = [
    PIIType.PERSON_NAME,
    PIIType.DATE_OF_BIRTH,
    PIIType.POSTAL_ADDRESS,
    PIIType.CITY,
    PIIType.UNKNOWN_PII,
  ];

  private PERSON_REGEX = /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b|\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;
  private DOB_REGEX = /\b(?:DOB|Date of Birth|Born|Birthdate)[:\s]+(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi;
  private ADDRESS_REGEX = /\b\d{1,5}\s+(?:[A-Z][a-zA-Z0-9#.\s]{2,30})\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct)\b/gi;
  private CITY_REGEX = /\b(?:New York|San Francisco|Los Angeles|Chicago|Houston|London|Paris|Tokyo|Berlin|Toronto|Mumbai|Delhi|Bangalore)\b/g;
  private REF_ID_REGEX = /\b(?:Patient\s+(?:Ref|Reference|ID)|MRN|Record\s+Number|Account\s+Number)[:\s]+([A-Z0-9_-]{4,20})\b/gi;

  public async extractEntities(text: string): Promise<INEREntity[]> {
    const entities: INEREntity[] = [];
    if (!text) return entities;

    // 1. Person Names
    let match: RegExpExecArray | null;
    this.PERSON_REGEX.lastIndex = 0;
    const commonWords = new Set(['The', 'This', 'That', 'With', 'From', 'Have', 'They', 'Your', 'Their', 'Note', 'Page', 'Item', 'Date', 'Type', 'Name', 'City', 'Road', 'Code', 'File', 'User']);

    while ((match = this.PERSON_REGEX.exec(text)) !== null) {
      const matchText = match[0];
      const words = matchText.split(/\s+/);

      if (words.some((w) => commonWords.has(w))) {
        continue;
      }

      entities.push({
        type: PIIType.PERSON_NAME,
        text: matchText,
        startOffset: match.index,
        endOffset: match.index + matchText.length,
        confidence: matchText.startsWith('Mr.') || matchText.startsWith('Dr.') ? 0.9 : 0.7,
      });
    }

    // 2. Date of Birth
    this.DOB_REGEX.lastIndex = 0;
    while ((match = this.DOB_REGEX.exec(text)) !== null) {
      const matchText = match[0];
      const datePartMatch = matchText.match(/(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
      const targetText = datePartMatch ? datePartMatch[0] : matchText;
      const offsetDelta = datePartMatch ? matchText.indexOf(datePartMatch[0]) : 0;
      entities.push({
        type: PIIType.DATE_OF_BIRTH,
        text: targetText,
        startOffset: match.index + offsetDelta,
        endOffset: match.index + offsetDelta + targetText.length,
        confidence: 0.9,
      });
    }

    // 3. Postal Address
    this.ADDRESS_REGEX.lastIndex = 0;
    while ((match = this.ADDRESS_REGEX.exec(text)) !== null) {
      const matchText = match[0];
      entities.push({
        type: PIIType.POSTAL_ADDRESS,
        text: matchText,
        startOffset: match.index,
        endOffset: match.index + matchText.length,
        confidence: 0.8,
      });
    }

    // 4. City
    this.CITY_REGEX.lastIndex = 0;
    while ((match = this.CITY_REGEX.exec(text)) !== null) {
      const matchText = match[0];
      entities.push({
        type: PIIType.CITY,
        text: matchText,
        startOffset: match.index,
        endOffset: match.index + matchText.length,
        confidence: 0.85,
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
