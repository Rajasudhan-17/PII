import { MutationGenerator } from '../../src/services/transformation/mutationGenerator';
import { PIIType, PIICategory } from '../../src/config/piiTaxonomy';

describe('MutationGenerator Unit Tests', () => {
  const context = {
    transformationRunId: 'trans_run_test_123',
    seed: 'seed_hash_abc123',
  };

  test('generates synthetic replacement for PERSON_NAME, EMAIL_ADDRESS, PHONE_NUMBER, CITY, US_SSN', () => {
    const generator = new MutationGenerator(context);

    const name = generator.getSyntheticReplacement('John Doe', PIIType.PERSON_NAME, PIICategory.DIRECT_IDENTIFIER);
    const email = generator.getSyntheticReplacement('john@example.com', PIIType.EMAIL_ADDRESS, PIICategory.CONTACT_INFORMATION);
    const phone = generator.getSyntheticReplacement('555-123-4567', PIIType.PHONE_NUMBER, PIICategory.CONTACT_INFORMATION);
    const city = generator.getSyntheticReplacement('New York', PIIType.CITY, PIICategory.LOCATION_DATA);
    const ssn = generator.getSyntheticReplacement('123-45-6789', PIIType.US_SSN, PIICategory.GOVERNMENT_ID);

    expect(name).not.toBe('John Doe');
    expect(typeof name).toBe('string');

    expect(email).not.toBe('john@example.com');
    expect(email).toContain('@example.invalid');

    expect(phone).not.toBe('555-123-4567');
    expect(phone).toMatch(/^\+1-555-\d{4}$/);

    expect(city).not.toBe('New York');

    expect(ssn).not.toBe('123-45-6789');
    expect(ssn).toMatch(/^000-00-\d{4}$/);
  });

  test('run-scoped determinism: identical context & input produces identical output', () => {
    const gen1 = new MutationGenerator(context);
    const gen2 = new MutationGenerator(context);

    const res1 = gen1.getSyntheticReplacement('Alice Smith', PIIType.PERSON_NAME, PIICategory.DIRECT_IDENTIFIER);
    const res2 = gen2.getSyntheticReplacement('Alice Smith', PIIType.PERSON_NAME, PIICategory.DIRECT_IDENTIFIER);

    expect(res1).toBe(res2);
  });

  test('entity consistency: same rawText within single run returns same synthetic replacement', () => {
    const generator = new MutationGenerator(context);

    const first = generator.getSyntheticReplacement('Jane Doe', PIIType.PERSON_NAME, PIICategory.DIRECT_IDENTIFIER);
    const second = generator.getSyntheticReplacement('Jane Doe', PIIType.PERSON_NAME, PIICategory.DIRECT_IDENTIFIER);
    const third = generator.getSyntheticReplacement(' JANE DOE ', PIIType.PERSON_NAME, PIICategory.DIRECT_IDENTIFIER);

    expect(first).toBe(second);
    expect(first).toBe(third);
  });

  test('Credential Safety Invariant: SECURITY_CREDENTIAL, AUTH_TOKEN_KEY, CREDIT_CARD_NUMBER, API_KEY are NEVER mutated into usable credentials', () => {
    const generator = new MutationGenerator(context);

    const authToken = generator.getSyntheticReplacement('bearer-secret-token-123', PIIType.AUTH_TOKEN_KEY, PIICategory.SECURITY_CREDENTIAL);
    const creditCard = generator.getSyntheticReplacement('4532-0123-4567-8901', PIIType.CREDIT_CARD_NUMBER, PIICategory.FINANCIAL_INFORMATION);
    const apiKey = generator.getSyntheticReplacement('sk-live-999999999', 'API_KEY', PIICategory.SECURITY_CREDENTIAL);
    const privateKey = generator.getSyntheticReplacement('-----BEGIN PRIVATE KEY-----', 'PRIVATE_KEY', PIICategory.SECURITY_CREDENTIAL);

    expect(authToken).toBe('[REDACTED_CREDENTIAL]');
    expect(creditCard).toBe('[REDACTED_CREDENTIAL]');
    expect(apiKey).toBe('[REDACTED_CREDENTIAL]');
    expect(privateKey).toBe('[REDACTED_CREDENTIAL]');
  });
});
