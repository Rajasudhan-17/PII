import { RelationshipDetector } from '../../src/services/context/relationshipDetector';
import { IPIICandidate } from '../../src/models/piiCandidate.model';
import { PIIType, PIICategory, PIISeverity } from '../../src/config/piiTaxonomy';

describe('RelationshipDetector Unit Tests', () => {
  const targetCandidate = {
    candidateId: 'cand_name',
    type: PIIType.PERSON_NAME,
    category: PIICategory.DIRECT_IDENTIFIER,
    text: 'Jane Doe',
    severity: PIISeverity.MEDIUM,
    location: {
      startOffset: 10,
      endOffset: 18,
      blockId: 'blk_1',
      pageNumber: 1,
    },
  } as unknown as IPIICandidate;

  const emailCandidate = {
    candidateId: 'cand_email',
    type: PIIType.EMAIL_ADDRESS,
    category: PIICategory.CONTACT_INFORMATION,
    text: 'jane@example.com',
    severity: PIISeverity.MEDIUM,
    location: {
      startOffset: 25,
      endOffset: 41,
      blockId: 'blk_1',
      pageNumber: 1,
    },
  } as unknown as IPIICandidate;

  test('should detect PERSON_NAME_EMAIL relationship when co-occurring in same block', () => {
    const res = RelationshipDetector.detectRelationships(targetCandidate, [targetCandidate, emailCandidate]);
    expect(res.length).toBe(1);
    expect(res[0].relationshipType).toBe('PERSON_NAME_EMAIL');
    expect(res[0].status).toBe('SUPPORTED');
  });
});
