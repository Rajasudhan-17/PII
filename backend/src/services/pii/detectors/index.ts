import { PIIDetectorRegistry } from './detector.registry';
import { EmailDetector } from './email.detector';
import { PhoneDetector } from './phone.detector';
import { CreditCardDetector } from './creditCard.detector';
import { IBANDetector } from './iban.detector';
import { AuthSecurityDetector } from './authSecurity.detector';
import { NationalIDDetector } from './nationalId.detector';
import { NERDetector } from './ner.detector';

export * from './detector.interface';
export * from './detector.registry';
export * from './email.detector';
export * from './phone.detector';
export * from './creditCard.detector';
export * from './iban.detector';
export * from './authSecurity.detector';
export * from './nationalId.detector';
export * from './ner.detector';

export function initializeDefaultDetectors(): PIIDetectorRegistry {
  const registry = PIIDetectorRegistry.getInstance();
  
  // Register default detectors if registry is empty
  if (registry.getAllDetectors().length === 0) {
    registry.register(new EmailDetector());
    registry.register(new PhoneDetector());
    registry.register(new CreditCardDetector());
    registry.register(new IBANDetector());
    registry.register(new AuthSecurityDetector());
    registry.register(new NationalIDDetector());
    registry.register(new NERDetector());
  }

  return registry;
}
