import { PIIDetectorRegistry } from './detector.registry';
import { EmailDetector } from './email.detector';
import { PhoneDetector } from './phone.detector';
import { CreditCardDetector } from './creditCard.detector';
import { IBANDetector } from './iban.detector';
import { AuthSecurityDetector } from './authSecurity.detector';
import { NationalIDDetector } from './nationalId.detector';
import { PassportDetector } from './passport.detector';
import { DrivingLicenseDetector } from './drivingLicense.detector';
import { NERDetector } from './ner.detector';
import { PresidioNERProvider } from '../ner/presidio.provider';
import { HeuristicNERProvider } from '../ner/heuristicNER.provider';

export * from './detector.interface';
export * from './detector.registry';
export * from './email.detector';
export * from './phone.detector';
export * from './creditCard.detector';
export * from './iban.detector';
export * from './authSecurity.detector';
export * from './nationalId.detector';
export * from './passport.detector';
export * from './drivingLicense.detector';
export * from './ner.detector';
export * from '../ner/ner.interface';
export * from '../ner/heuristicNER.provider';
export * from '../ner/presidio.provider';

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
    registry.register(new PassportDetector());
    registry.register(new DrivingLicenseDetector());

    const nerServiceUrl = process.env.NER_SERVICE_URL;
    if (nerServiceUrl && nerServiceUrl.trim().length > 0) {
      registry.register(new NERDetector(new PresidioNERProvider(nerServiceUrl.trim())));
    } else {
      registry.register(new NERDetector(new HeuristicNERProvider()));
    }
  }

  return registry;
}
