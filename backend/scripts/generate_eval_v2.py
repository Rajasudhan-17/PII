import json
import random
import re
from faker import Faker

fake_us = Faker('en_US')
fake_in = Faker('en_IN')
Faker.seed(42)
random.seed(42)

# --- Checksum Algorithms ---

# Verhoeff
verhoeff_d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 1, 2, 3, 4],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
]
verhoeff_p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 4, 9, 0],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
]
verhoeff_inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]

def generate_aadhaar(with_spaces=True):
    first = str(random.randint(2, 9))
    rest = ''.join([str(random.randint(0, 9)) for _ in range(10)])
    num11 = first + rest
    c = 0
    rev = [int(x) for x in reversed(num11)]
    for i in range(len(rev)):
        c = verhoeff_d[c][verhoeff_p[(i + 1) % 8][rev[i]]]
    checksum = verhoeff_inv[c]
    full = num11 + str(checksum)
    if with_spaces:
        return f"{full[0:4]} {full[4:8]} {full[8:12]}"
    return full

def generate_credit_card(with_spaces=True):
    prefix = random.choice(['4532', '5424', '4024', '5105', '4111'])
    digits = [int(x) for x in prefix] + [random.randint(0, 9) for _ in range(15 - len(prefix))]
    sum_ = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        sum_ += d
    check = (10 - (sum_ % 10)) % 10
    digits.append(check)
    raw = ''.join(map(str, digits))
    if with_spaces:
        return f"{raw[0:4]} {raw[4:8]} {raw[8:12]} {raw[12:16]}"
    return raw

def generate_iban(with_spaces=True):
    country = random.choice(['GB', 'DE', 'FR'])
    if country == 'GB':
        bban = 'WEST' + ''.join([str(random.randint(0, 9)) for _ in range(14)])
    elif country == 'DE':
        bban = ''.join([str(random.randint(0, 9)) for _ in range(18)])
    else:
        bban = ''.join([str(random.randint(0, 9)) for _ in range(20)])
    temp = bban + country + '00'
    digits = ''
    for c in temp:
        if c.isalpha():
            digits += str(ord(c) - 55)
        else:
            digits += c
    rem = int(digits) % 97
    check = 98 - rem
    raw = f"{country}{check:02d}{bban}"
    if with_spaces:
        return ' '.join([raw[i:i+4] for i in range(0, len(raw), 4)])
    return raw

def generate_ssn(with_dashes=True):
    area = random.choice([i for i in range(1, 899) if i != 666])
    group = random.randint(1, 99)
    serial = random.randint(1, 9999)
    if with_dashes:
        return f"{area:03d}-{group:02d}-{serial:04d}"
    return f"{area:03d}{group:02d}{serial:04d}"

def generate_pan():
    letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    fourth = random.choice(['P', 'C', 'H', 'A', 'B', 'G', 'J', 'L', 'F', 'T'])
    p1 = random.choice(letters) + random.choice(letters) + random.choice(letters) + fourth + random.choice(letters)
    nums = f"{random.randint(1000, 9999)}"
    p2 = random.choice(letters)
    return p1 + nums + p2

def generate_passport():
    series = random.choice(['A', 'B', 'J', 'K', 'L', 'M', 'P', 'R', 'S', 'T', 'Z'])
    num = f"{random.randint(1000000, 9999999)}"
    return series + num

def generate_driving_licence():
    state = random.choice(['TN', 'MH', 'KA', 'DL', 'UP', 'GJ', 'WB'])
    rto = f"{random.randint(1, 75):02d}"
    year = random.randint(2005, 2023)
    num = f"{random.randint(1000000, 9999999)}"
    return f"{state}{rto} {year}{num}"

# --- Entity Builders ---

INDIAN_CITIES = ['Chennai', 'Mumbai', 'Bangalore', 'Delhi', 'Hyderabad', 'Kolkata', 'Pune', 'Ahmedabad', 'Coimbatore', 'Jaipur', 'Kochi', 'Lucknow', 'Chandigarh']
US_CITIES = ['New York', 'Chicago', 'San Francisco', 'Los Angeles', 'Houston', 'Seattle', 'Boston', 'Austin', 'Denver', 'Miami']

INDIAN_STREET_NAMES = ['Gandhi Road', 'Anna Salai', 'MG Road', 'Park Street', 'Brigade Road', 'Nehru Nagar', 'Lakeview Colony', 'Indiranagar 5th Cross', 'Koramangala 4th Block', 'Velachery Main Road', 'T. Nagar', 'Vashi Sector 17']
US_STREET_NAMES = ['Main Street', 'Oak Avenue', 'Maple Drive', 'Washington Boulevard', 'Lincoln Way', 'Market Street', 'Broadway', 'Elm Street', 'Park Avenue']

HARD_NEGATIVE_PHRASES = [
    'Microsoft Corporation', 'Apple Watch', 'Grand Canyon National Park',
    'Customer Success Team', 'Finance Department', 'Quarterly Financial Review',
    'Human Resources Division', 'Terms and Conditions', 'Golden Gate Bridge',
    'Amazon Kindle Paperwhite', 'Northwind Traders Inc', 'Mount Everest Expedition',
    'Executive Leadership Summit', 'Global Compliance Guidelines', 'Standard Operating Procedures'
]

HARD_NEGATIVE_CODES = [
    ('Invoice reference', 'INV-2026-88129'),
    ('Billing reference', 'INV-88912-A'),
    ('Tracking number', '1Z999AA10123456784'),
    ('AWB consignment number', '88129034567'),
    ('Order ID', 'ORD-2026-99182'),
    ('Product SKU', 'SKU-8891283'),
    ('Case matter number', 'CASE-2026-77182'),
    ('Equipment serial number', 'SN-998811223344'),
    ('Employee badge number', '981273645'),
    ('Diagnostic device code', 'MOD-88129')
]

HARD_NEGATIVE_MAILS = [
    'support@company.example', 'info@globalcorp.example', 'sales@enterprise.example',
    'helpdesk@service.example', 'billing@cloudplatform.example', 'contact@organization.example'
]

# Generate documents
documents = []
total_docs = 350

# Track counts
type_counts = {}

for idx in range(1, total_docs + 1):
    doc_id = f"doc_{idx:03d}.txt"
    split = 'dev' if idx % 2 == 1 else 'heldout'
    
    # Decide doc flavor:
    # 0: Medical intake
    # 1: Financial statement
    # 2: HR / Employee contract
    # 3: Legal agreement
    # 4: Customer service / Ticket
    # 5: Technical log / Security audit
    # 6, 7, 8: Pure hard negative documents (business / logistics / public notices) -> 3/9 = 33.3% hard negative docs
    flavor = idx % 9
    
    entities = []
    lines = []
    
    if flavor == 0:
        doc_type = 'MEDICAL'
        lines.append("METROPOLITAN GENERAL HOSPITAL — PATIENT CLINICAL INTAKE")
        lines.append("CONFIDENTIAL HEALTHCARE RECORD")
        lines.append("")
        
        # Name variant
        name_choice = random.choice([
            fake_in.name(),
            fake_us.name(),
            "Kavitha M. Nair",
            "José García",
            "Sean O'Brien",
            "Mary-Jane Watson",
            "SURESH KUMAR",
            "arun vishwanathan"
        ])
        lines.append(f"Patient Name: {name_choice}")
        entities.append({"type": "PERSON_NAME", "text": name_choice})
        
        # DOB variant
        dob_choice = random.choice([
            "17/08/1988", "1988-08-17", "08/17/1988", "August 17, 1988", "17th Aug 1988", "3rd March 1995"
        ])
        lines.append(f"Date of Birth: {dob_choice}")
        entities.append({"type": "DATE_OF_BIRTH", "text": dob_choice})
        
        phone_choice = random.choice(["+91 98765 43210", "+1 (555) 123-4567", "9876543210", "080-23456789"])
        lines.append(f"Emergency Phone: {phone_choice}")
        entities.append({"type": "PHONE_NUMBER", "text": phone_choice})
        
        email_choice = f"{fake_in.first_name().lower()}.{fake_in.last_name().lower()}@patient-mail.example"
        lines.append(f"Contact Email: {email_choice}")
        entities.append({"type": "EMAIL_ADDRESS", "text": email_choice})
        
        # Indian or US address
        if random.random() < 0.6:
            addr_choice = f"{random.randint(1, 99)}/{random.randint(1, 10)} {random.choice(INDIAN_STREET_NAMES)}, {random.choice(INDIAN_CITIES)} {random.randint(560001, 600099)}"
        else:
            addr_choice = f"{random.randint(10, 999)} {random.choice(US_STREET_NAMES)}, {random.choice(US_CITIES)}"
        lines.append(f"Residential Address: {addr_choice}")
        entities.append({"type": "POSTAL_ADDRESS", "text": addr_choice})
        
        # Aadhaar or SSN
        if random.random() < 0.6:
            id_val = generate_aadhaar(with_spaces=True)
            lines.append(f"Aadhaar Number: {id_val}")
            entities.append({"type": "INDIAN_AADHAAR", "text": id_val})
        else:
            id_val = generate_ssn(with_dashes=True)
            lines.append(f"Social Security Number: {id_val}")
            entities.append({"type": "US_SSN", "text": id_val})
            
        # Hard negative in medical doc
        lines.append(f"Equipment Serial: MOD-99182")
        lines.append(f"Billing Invoice: INV-2026-88129")
        lines.append(f"General Support Desk: support@metrohealth.example")

    elif flavor == 1:
        doc_type = 'FINANCIAL'
        lines.append("GLOBAL INVESTMENT BANKING — REMITTANCE ADVICE")
        lines.append("")
        
        name_choice = random.choice([fake_in.name(), fake_us.name(), "Dr. Vikram Seth", "Renée Dupont", "CHETAN SHAH"])
        lines.append(f"Account Holder: {name_choice}")
        entities.append({"type": "PERSON_NAME", "text": name_choice})
        
        card_choice = generate_credit_card(with_spaces=True)
        lines.append(f"Corporate Expense Card: {card_choice}")
        entities.append({"type": "CREDIT_CARD_NUMBER", "text": card_choice})
        
        iban_choice = generate_iban(with_spaces=True)
        lines.append(f"Settlement IBAN: {iban_choice}")
        entities.append({"type": "IBAN", "text": iban_choice})
        
        pan_choice = generate_pan()
        lines.append(f"Income Tax PAN: {pan_choice}")
        entities.append({"type": "INDIAN_PAN", "text": pan_choice})
        
        # Hard negatives in financial doc
        lines.append(f"Transaction Reference: REF-8812903")
        lines.append(f"Settlement Batch: BATCH-2026-1047")
        lines.append(f"Total Amount Remitted: $145,250.00 USD")
        lines.append(f"Swift Network Routing Code: SWIFT-GB-2026")
        lines.append(f"Corporate Legal Entity: Northwind Traders Inc.")

    elif flavor == 2:
        doc_type = 'HR'
        lines.append("TALENT ACQUISITION — EMPLOYMENT OFFER & VERIFICATION")
        lines.append("")
        
        name_choice = random.choice([fake_in.name(), fake_us.name(), "Ananya Krishnan", "François Müller", "priya venkatesh"])
        lines.append(f"Candidate Full Name: {name_choice}")
        entities.append({"type": "PERSON_NAME", "text": name_choice})
        
        dob_choice = random.choice(["24/11/1992", "November 24, 1992", "24th Nov 1992", "1992-11-24"])
        lines.append(f"Date of Birth: {dob_choice}")
        entities.append({"type": "DATE_OF_BIRTH", "text": dob_choice})
        
        email_choice = f"{fake_us.first_name().lower()}{random.randint(10, 99)}@personal-box.example"
        lines.append(f"Applicant Email: {email_choice}")
        entities.append({"type": "EMAIL_ADDRESS", "text": email_choice})
        
        phone_choice = random.choice(["+91 91234 56789", "+1-800-555-0199", "555-123-4567", "044 24567890"])
        lines.append(f"Direct Contact: {phone_choice}")
        entities.append({"type": "PHONE_NUMBER", "text": phone_choice})
        
        passport_choice = generate_passport()
        lines.append(f"Passport Number: {passport_choice}")
        entities.append({"type": "PASSPORT", "text": passport_choice})
        
        dl_choice = generate_driving_licence()
        lines.append(f"Driving Licence: {dl_choice}")
        entities.append({"type": "DRIVING_LICENSE", "text": dl_choice})
        
        # Hard negatives in HR doc
        lines.append(f"Internal Employee Badge ID: 981273645")
        lines.append(f"Department: Human Resources Division")
        lines.append(f"Role: Customer Success Lead")
        lines.append(f"Company: Microsoft Corporation")

    elif flavor == 3:
        doc_type = 'LEGAL'
        lines.append("NON-DISCLOSURE AND MUTUAL SETTLEMENT AGREEMENT")
        lines.append("")
        
        rep_name = random.choice([fake_us.name(), fake_in.name(), "David Vance", "Tara McDonald", "MOHIT VERMA"])
        lines.append(f"Authorized Representative: {rep_name}")
        entities.append({"type": "PERSON_NAME", "text": rep_name})
        
        email_choice = f"{rep_name.replace(' ', '.').lower()}@executive-legal.example"
        lines.append(f"Signatory Email: {email_choice}")
        entities.append({"type": "EMAIL_ADDRESS", "text": email_choice})
        
        ssn_choice = generate_ssn(with_dashes=True)
        lines.append(f"Witness SSN: {ssn_choice}")
        entities.append({"type": "US_SSN", "text": ssn_choice})
        
        if random.random() < 0.5:
            pan_choice = generate_pan()
            lines.append(f"Signatory PAN: {pan_choice}")
            entities.append({"type": "INDIAN_PAN", "text": pan_choice})
            
        # Hard negatives in legal doc
        lines.append(f"Court Case Number: CASE-2026-77182")
        lines.append(f"Statutory Filing Reference: ORD-99182")
        lines.append(f"Jurisdiction: State of Delaware Court of Chancery")
        lines.append(f"Terms and Conditions apply under federal jurisdiction.")

    elif flavor == 4:
        doc_type = 'CUSTOMER_SUPPORT'
        lines.append("ENTERPRISE CLOUD PLATFORM — INCIDENT TICKET")
        lines.append("")
        
        cust_name = random.choice([fake_in.name(), fake_us.name(), "Maya Patel", "John D. Rockefeller", "alex morgan"])
        lines.append(f"Reported By: {cust_name}")
        entities.append({"type": "PERSON_NAME", "text": cust_name})
        
        phone_choice = random.choice(["+91 99887 76655", "+44 20 7946 0919", "(555) 123-4567"])
        lines.append(f"Customer Callback: {phone_choice}")
        entities.append({"type": "PHONE_NUMBER", "text": phone_choice})
        
        # Obfuscated or regular email
        if random.random() < 0.4:
            clean_first = fake_in.first_name().lower()
            obfuscated = f"{clean_first} [at] gmail [dot] com"
            lines.append(f"Secondary Email: {obfuscated}")
            entities.append({"type": "EMAIL_ADDRESS", "text": obfuscated})
        else:
            email_choice = f"{fake_in.first_name().lower()}@customer-domain.example"
            lines.append(f"Account Email: {email_choice}")
            entities.append({"type": "EMAIL_ADDRESS", "text": email_choice})
            
        addr_choice = f"{random.randint(10, 800)} {random.choice(INDIAN_STREET_NAMES)}, {random.choice(INDIAN_CITIES)} {random.randint(560001, 600099)}"
        lines.append(f"Billing Location: {addr_choice}")
        entities.append({"type": "POSTAL_ADDRESS", "text": addr_choice})
        
        # Hard negatives
        lines.append(f"Courier Shipment Tracking: 1Z999AA10123456784")
        lines.append(f"Airway Bill Consignment: AWB 987654321098")
        lines.append(f"Product Purchased: Apple Watch Ultra")
        lines.append(f"Help Desk Contact: support@cloudplatform.example")

    elif flavor == 5:
        doc_type = 'SECURITY_AUDIT'
        lines.append("DEVSECOPS INFRASTRUCTURE & CREDENTIAL AUDIT REPORT")
        lines.append("")
        
        lead_name = random.choice([fake_us.name(), fake_in.name(), "Arun Mehta", "Sean O'Brien"])
        lines.append(f"Audit Conducted By: {lead_name}")
        entities.append({"type": "PERSON_NAME", "text": lead_name})
        
        # Credentials
        cred_type = random.choice(['AWS', 'GITHUB', 'JWT', 'PASSWORD'])
        if cred_type == 'AWS':
            cred_val = "AKIAIOSFODNN7EXAMPLE"
            lines.append(f"Exposed AWS Access Key: {cred_val}")
            entities.append({"type": "AUTH_TOKEN_KEY", "text": cred_val})
        elif cred_type == 'GITHUB':
            token_suffix = ''.join(random.choices('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', k=36))
            cred_val = f"ghp_{token_suffix}"
            lines.append(f"GitHub Personal Access Token: {cred_val}")
            entities.append({"type": "AUTH_TOKEN_KEY", "text": cred_val})
        elif cred_type == 'JWT':
            cred_val = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
            lines.append(f"Bearer Token Exposed: {cred_val}")
            entities.append({"type": "AUTH_TOKEN_KEY", "text": cred_val})
        else:
            cred_val = "P@ssw0rd!Secure2026#"
            lines.append(f"Database Admin password = {cred_val}")
            entities.append({"type": "AUTH_TOKEN_KEY", "text": cred_val})
            
        # Hard negatives
        lines.append(f"Server Hostname: prod-db-cluster-01.internal")
        lines.append(f"Commit Hash: 7f8a9b2c3d4e5f6a1b2c3d4e5f6a7b8c9d0e1f2a")
        lines.append(f"Log Timestamp: 2026-10-21T18:45:00.000Z")
        lines.append(f"System IP Address: 192.168.1.105")

    else:
        # Flavor 6: PURE HARD NEGATIVE DOCUMENT (Zero PII, 100% legitimate non-PII text)
        doc_type = 'GENERAL'
        lines.append("GLOBAL COMMERCIAL LOGISTICS & CORPORATE ASSET DIRECTORY")
        lines.append("PUBLIC RELEASE DOCUMENT — NO PERSONAL IDENTIFIERS")
        lines.append("")
        lines.append(f"Operating Entity: {random.choice(HARD_NEGATIVE_PHRASES)}")
        lines.append(f"Regional Headquarters: {random.choice(HARD_NEGATIVE_PHRASES)}")
        
        # Pick 3-4 hard negative codes
        for label, code in random.sample(HARD_NEGATIVE_CODES, 4):
            lines.append(f"{label}: {code}")
            
        lines.append(f"Official Support Channel: {random.choice(HARD_NEGATIVE_MAILS)}")
        lines.append(f"Inquiries Desk: {random.choice(HARD_NEGATIVE_MAILS)}")
        lines.append("All transactions are strictly audited pursuant to commercial trade regulations.")
        lines.append("Grand Canyon Travel Guide and Apple Watch warranty details are registered separately.")
        lines.append("Financial Quarter Q3 Total Disbursed: $984,520.00 USD.")
        # Zero entities in this document!

    full_text = '\n'.join(lines)
    
    # Compute exact offsets for entities in the full_text
    verified_entities = []
    for ent in entities:
        target = ent['text']
        # Find start offset
        start = full_text.find(target)
        if start != -1:
            end = start + len(target)
            verified_entities.append({
                "type": ent['type'],
                "text": target,
                "startOffset": start,
                "endOffset": end
            })
            type_counts[ent['type']] = type_counts.get(ent['type'], 0) + 1
        else:
            print(f"Warning: target '{target}' not found in doc {doc_id}")

    documents.append({
        "document": doc_id,
        "documentType": doc_type,
        "split": split,
        "text": full_text,
        "entities": verified_entities
    })

dev_count = sum(1 for d in documents if d['split'] == 'dev')
heldout_count = sum(1 for d in documents if d['split'] == 'heldout')
hard_neg_docs = sum(1 for d in documents if len(d['entities']) == 0)

print(f"Generated {len(documents)} documents ({dev_count} dev, {heldout_count} heldout)")
print(f"Zero-PII pure hard negative documents: {hard_neg_docs} ({(hard_neg_docs/len(documents))*100:.1f}%)")
print("Entity counts across corpus:")
for k, v in sorted(type_counts.items()):
    print(f"  {k}: {v}")

output_path = 'backend/tests/gold-standard/eval_v2.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(documents, f, indent=2, ensure_ascii=False)

print(f"Saved eval_v2 corpus to {output_path}")
