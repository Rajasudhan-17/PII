import { MutationGenerator } from '../../src/services/transformation/mutationGenerator';
import { PIIType, PIICategory } from '../../src/config/piiTaxonomy';

describe('Mutation Safety Adversarial Unit Tests', () => {
  const context = {
    transformationRunId: 'trans_mut_safe_1',
    seed: 'seed_mut_safe_1',
  };

  test('synthetic email domain uses reserved non-deliverable RFC 2606 domain @example.invalid', () => {
    const generator = new MutationGenerator(context);
    const email = generator.getSyntheticReplacement('user@company.com', PIIType.EMAIL_ADDRESS, PIICategory.CONTACT_INFORMATION);
    expect(email).toMatch(/^[a-zA-Z0-9_]+@example\.invalid$/);
  });

  test('synthetic phone uses safe non-routing prefix +1-555-xxxx', () => {
    const generator = new MutationGenerator(context);
    const phone = generator.getSyntheticReplacement('987-654-3210', PIIType.PHONE_NUMBER, PIICategory.CONTACT_INFORMATION);
    expect(phone).toMatch(/^\+1-555-\d{4}$/);
  });

  test('synthetic SSN uses invalid zero prefix 000-00-xxxx', () => {
    const generator = new MutationGenerator(context);
    const ssn = generator.getSyntheticReplacement('123-45-6789', PIIType.US_SSN, PIICategory.GOVERNMENT_ID);
    expect(ssn).toMatch(/^000-00-\d{4}$/);
  });

  test('Credential Safety Invariant: security credentials and API keys are NEVER mutated into usable secrets', () => {
    const generator = new MutationGenerator(context);

    const api = generator.getSyntheticReplacement('sk-live-abcdef123456', 'API_KEY', PIICategory.SECURITY_CREDENTIAL);
    const auth = generator.getSyntheticReplacement('bearer-token-999', PIIType.AUTH_TOKEN_KEY, PIICategory.SECURITY_CREDENTIAL);
    const priv = generator.getSyntheticReplacement('-----BEGIN RSA PRIVATE KEY-----', 'PRIVATE_KEY', PIICategory.SECURITY_CREDENTIAL);
    const card = generator.getSyntheticReplacement('4532-0123-4567-8901', PIIType.CREDIT_CARD_NUMBER, PIICategory.FINANCIAL_INFORMATION);

    expect(api).toBe('[REDACTED_CREDENTIAL]');
    expect(auth).toBe('[REDACTED_CREDENTIAL]');
    expect(priv).toBe('[REDACTED_CREDENTIAL]');
    expect(card).toBe('[REDACTED_CREDENTIAL]');
  });
});
