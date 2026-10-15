import { EmailDetector } from '../../src/services/pii/detectors/email.detector';
import { PhoneDetector } from '../../src/services/pii/detectors/phone.detector';

describe('Unicode UTF-16 Offset Alignment Unit Tests', () => {
  it('should maintain exact 1:1 UTF-16 string.substring alignment for multi-byte Unicode characters (Tamil, Hindi, Emojis)', async () => {
    const emailDetector = new EmailDetector();
    const phoneDetector = new PhoneDetector();

    // Multi-byte Unicode prefix containing Tamil, Hindi, and Emojis
    const prefix = 'மன்னிக்கவும் 🙏 नमस्ते 🚀 ';
    const email = 'user.test@domain.org';
    const phone = '+1-800-555-0199';
    const text = `${prefix}Please contact ${email} or call ${phone} for help.`;

    const emailResults = await emailDetector.detect(text, { documentId: 'doc1', organizationId: 'org1' });
    const phoneResults = await phoneDetector.detect(text, { documentId: 'doc1', organizationId: 'org1' });

    expect(emailResults.length).toBe(1);
    expect(phoneResults.length).toBe(1);

    const emailCand = emailResults[0];
    const phoneCand = phoneResults[0];

    // Verify JavaScript string.substring(startOffset, endOffset) extracts the exact text
    const extractedEmail = text.substring(emailCand.startOffset, emailCand.endOffset);
    expect(extractedEmail).toBe(email);

    const extractedPhone = text.substring(phoneCand.startOffset, phoneCand.endOffset);
    expect(extractedPhone).toBe(phone);
  });
});
