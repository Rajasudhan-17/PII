import { IPIICandidate } from '../../models/piiCandidate.model';
import { IRelationshipEvidence } from '../../models/contextResult.model';
import { RelationshipType, RelationshipStatus } from '../../config/contextTaxonomy';
import { PIICategory, PIIType } from '../../config/piiTaxonomy';

export class RelationshipDetector {
  public static detectRelationships(
    targetCandidate: IPIICandidate,
    allCandidates: IPIICandidate[]
  ): IRelationshipEvidence[] {
    const relationships: IRelationshipEvidence[] = [];

    // Filter candidate list excluding self
    const otherCandidates = allCandidates.filter(
      (c) => c.candidateId !== targetCandidate.candidateId
    );

    for (const other of otherCandidates) {
      // Proximity check: same page and blockId, or close offset range (within 300 chars)
      const isSameBlock =
        Boolean(targetCandidate.location.blockId) &&
        Boolean(other.location.blockId) &&
        targetCandidate.location.blockId === other.location.blockId;

      const offsetDistance = Math.abs(
        targetCandidate.location.startOffset - other.location.startOffset
      );
      const isCloseProximity = isSameBlock || offsetDistance <= 300;

      if (!isCloseProximity) {
        continue;
      }

      let relType: RelationshipType | null = null;
      let status: RelationshipStatus = 'SUPPORTED';

      if (
        (targetCandidate.type === PIIType.PERSON_NAME && other.type === PIIType.EMAIL_ADDRESS) ||
        (targetCandidate.type === PIIType.EMAIL_ADDRESS && other.type === PIIType.PERSON_NAME)
      ) {
        relType = 'PERSON_NAME_EMAIL';
      } else if (
        (targetCandidate.type === PIIType.PERSON_NAME && other.type === PIIType.PHONE_NUMBER) ||
        (targetCandidate.type === PIIType.PHONE_NUMBER && other.type === PIIType.PERSON_NAME)
      ) {
        relType = 'PERSON_NAME_PHONE';
      } else if (
        (targetCandidate.type === PIIType.PERSON_NAME && other.type === PIIType.POSTAL_ADDRESS) ||
        (targetCandidate.type === PIIType.POSTAL_ADDRESS && other.type === PIIType.PERSON_NAME)
      ) {
        relType = 'PERSON_NAME_ADDRESS';
      } else if (
        (targetCandidate.type === PIIType.PERSON_NAME && other.type === PIIType.DATE_OF_BIRTH) ||
        (targetCandidate.type === PIIType.DATE_OF_BIRTH && other.type === PIIType.PERSON_NAME)
      ) {
        relType = 'PERSON_NAME_DOB';
      } else if (
        targetCandidate.category === PIICategory.GOVERNMENT_ID ||
        targetCandidate.category === PIICategory.FINANCIAL_INFORMATION
      ) {
        relType = 'IDENTIFIER_OWNER';
        status = isSameBlock ? 'SUPPORTED' : 'WEAK';
      }

      if (relType) {
        relationships.push({
          relatedCandidateId: other.candidateId,
          relatedType: other.type,
          relationshipType: relType,
          status,
          evidenceDetails: `Co-occurs within ${isSameBlock ? 'same structural block' : `proximity distance of ${offsetDistance} characters`}`,
        });
      }
    }

    return relationships;
  }
}
