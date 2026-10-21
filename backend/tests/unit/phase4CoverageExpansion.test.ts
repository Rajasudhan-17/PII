import { EmailDetector } from '../../src/services/pii/detectors/email.detector';
import { PassportDetector } from '../../src/services/pii/detectors/passport.detector';
import { DrivingLicenseDetector } from '../../src/services/pii/detectors/drivingLicense.detector';
import { HeuristicNERProvider } from '../../src/services/pii/ner/heuristicNER.provider';
import { PIIType } from '../../src/config/piiTaxonomy';

describe('Phase 4 Coverage Expansion Unit Tests', () => {
  const dummyContext = {
    documentId: 'test_doc_001',
    organizationId: 'test_org_001',
  };

  describe('1. Date of Birth Detector Coverage', () => {
    const nerProvider = new HeuristicNERProvider();

    it('should detect ordinal Day-First formats when DOB context is present', async () => {
      const text = 'Candidate Full Name: Priya Sharma\nDate of Birth: 24th Nov 1992\nNationality: Indian';
      const entities = await nerProvider.extractEntities(text);
      const dobEntities = entities.filter((e) => e.type === PIIType.DATE_OF_BIRTH);

      expect(dobEntities).toHaveLength(1);
      expect(dobEntities[0].text).toBe('24th Nov 1992');
      expect(dobEntities[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect Month-First formats when DOB context is present', async () => {
      const text = 'Employee Record\nDOB: August 17, 1988\nDepartment: Engineering';
      const entities = await nerProvider.extractEntities(text);
      const dobEntities = entities.filter((e) => e.type === PIIType.DATE_OF_BIRTH);

      expect(dobEntities).toHaveLength(1);
      expect(dobEntities[0].text).toBe('August 17, 1988');
    });

    it('should detect Born / Birthdate context with various ordinal formats', async () => {
      const text = 'The patient was born on 3rd March 1995 at General Hospital.';
      const entities = await nerProvider.extractEntities(text);
      const dobEntities = entities.filter((e) => e.type === PIIType.DATE_OF_BIRTH);

      expect(dobEntities).toHaveLength(1);
      expect(dobEntities[0].text).toBe('3rd March 1995');
    });

    it('should NOT detect dates without DOB context (negative test)', async () => {
      const text = 'Invoice Generated: 24th Nov 1992. Meeting scheduled on August 17, 1988. Project kickoff: 3rd March 1995.';
      const entities = await nerProvider.extractEntities(text);
      const dobEntities = entities.filter((e) => e.type === PIIType.DATE_OF_BIRTH);

      expect(dobEntities).toHaveLength(0);
    });
  });

  describe('2. Passport Detector', () => {
    const passportDetector = new PassportDetector();

    it('should detect valid Indian passport numbers with passport context', async () => {
      const text = 'Identity Verification\nPassport Number: B5924115\nIssued by: Govt of India';
      const results = await passportDetector.detect(text, dummyContext);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe(PIIType.PASSPORT);
      expect(results[0].text).toBe('B5924115');
      expect(results[0].normalizedValue).toBe('B5924115');
      expect(results[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect passport when context follows or uses alternate forms', async () => {
      const text = 'Travel Document Details: T2677407 (Passport). Republic of India Passport: M2351868.';
      const results = await passportDetector.detect(text, dummyContext);

      expect(results.length).toBeGreaterThanOrEqual(1);
      const values = results.map((r) => r.text);
      expect(values).toContain('T2677407');
    });

    it('should reject bare alphanumeric IDs without passport context (hard negative)', async () => {
      const text = 'Product Code: B5924115. Serial: T2677407. Batch: M2351868. SKU: J9235577.';
      const results = await passportDetector.detect(text, dummyContext);

      expect(results).toHaveLength(0);
    });

    it('should reject codes preceded by tracking / shipment context (hard negative)', async () => {
      const text = 'Courier Shipment Tracking: B5924115. Order Ref: T2677407.';
      const results = await passportDetector.detect(text, dummyContext);

      expect(results).toHaveLength(0);
    });
  });

  describe('3. Driving Licence Detector', () => {
    const dlDetector = new DrivingLicenseDetector();

    it('should detect Indian Driving Licence with state code, RTO, year and number', async () => {
      const text = 'Driver Verification\nDriving Licence: TN09 20110012345\nHolder: Ramesh Kumar';
      const results = await dlDetector.detect(text, dummyContext);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe(PIIType.DRIVING_LICENSE);
      expect(results[0].text).toBe('TN09 20110012345');
      expect(results[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect alternate state codes and formats with DL context', async () => {
      const text = 'DL: DL21 20191054447. Driver License: MH20 20127426265.';
      const results = await dlDetector.detect(text, dummyContext);

      expect(results).toHaveLength(2);
      const values = results.map((r) => r.text);
      expect(values).toContain('DL21 20191054447');
      expect(values).toContain('MH20 20127426265');
    });

    it('should reject invalid state codes (hard negative)', async () => {
      const text = 'Driving Licence: XX09 20110012345. DL Number: ZZ21 20191054447.';
      const results = await dlDetector.detect(text, dummyContext);

      expect(results).toHaveLength(0);
    });

    it('should reject numbers without DL context or under tracking context (hard negative)', async () => {
      const text = 'Shipment AWB: TN09 20110012345. Tracking Number: DL21 20191054447.';
      const results = await dlDetector.detect(text, dummyContext);

      expect(results).toHaveLength(0);
    });
  });

  describe('4. Obfuscated Email Detection', () => {
    const emailDetector = new EmailDetector();

    it('should detect [at] and [dot] obfuscated emails and normalize them', async () => {
      const text = 'Please reach candidate at theodore [at] gmail [dot] com for interview.';
      const results = await emailDetector.detect(text, dummyContext);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe(PIIType.EMAIL_ADDRESS);
      expect(results[0].text).toBe('theodore [at] gmail [dot] com');
      expect(results[0].normalizedValue).toBe('theodore@gmail.com');
    });

    it('should detect (at) and (dot) obfuscated emails', async () => {
      const text = 'Client Contact: jeremiah (at) gmail (dot) com.';
      const results = await emailDetector.detect(text, dummyContext);

      expect(results).toHaveLength(1);
      expect(results[0].text).toBe('jeremiah (at) gmail (dot) com');
      expect(results[0].normalizedValue).toBe('jeremiah@gmail.com');
    });

    it('should filter out generic role mailboxes when obfuscated without personal context', async () => {
      const text = 'For customer service inquiries, email support [at] company [dot] com.';
      const results = await emailDetector.detect(text, dummyContext);

      // Generic role mailbox without personal context should be excluded by Phase 3 policy
      expect(results).toHaveLength(0);
    });
  });

  describe('5. Address Coverage & Gazetteer', () => {
    const nerProvider = new HeuristicNERProvider();

    it('should detect Indian composite addresses including locality, city and PIN', async () => {
      const text = 'Applicant Details\nResidential Address: 28/10 Vashi Sector 17, Kolkata 573935\nContact Phone: +91 9876543210';
      const entities = await nerProvider.extractEntities(text);
      const addresses = entities.filter((e) => e.type === PIIType.POSTAL_ADDRESS);

      expect(addresses).toHaveLength(1);
      expect(addresses[0].text).toBe('28/10 Vashi Sector 17, Kolkata 573935');
    });

    it('should detect US composite street and city addresses cleanly', async () => {
      const text = 'Billing Location: 240 Washington Boulevard, San Francisco\nPayment Method: Credit Card';
      const entities = await nerProvider.extractEntities(text);
      const addresses = entities.filter((e) => e.type === PIIType.POSTAL_ADDRESS);

      expect(addresses).toHaveLength(1);
      expect(addresses[0].text).toBe('240 Washington Boulevard, San Francisco');
    });

    it('should NOT flag isolated city mentions as PII (non-PII geographic references)', async () => {
      const text = 'The regional operations center is located in Chicago. We recently visited Paris and London.';
      const entities = await nerProvider.extractEntities(text);
      const addresses = entities.filter((e) => e.type === PIIType.POSTAL_ADDRESS);
      const cities = entities.filter((e) => e.type === PIIType.CITY);

      expect(addresses).toHaveLength(0);
      expect(cities).toHaveLength(0);
    });
  });
});
