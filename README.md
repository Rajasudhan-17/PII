# PII Enterprise Privacy, Redaction & Governance Platform

A production-ready, full-stack enterprise platform for automated sensitive data discovery, contextual PII detection, deterministic policy enforcement, physical document redaction/transformation, re-identification risk modeling, independent verification QA, and human-in-the-loop adjudication.

---

## 🚀 Key Highlights & Capabilities

- **Multi-Format Document Ingestion & OCR**:
  - Native text & layout extraction for PDF, DOCX, XLSX, CSV, Plain Text, and Images.
  - Optical Character Recognition (OCR) powered by Tesseract engine with coordinate/block tracking.
- **Hybrid PII Detection Engine**:
  - Deterministic high-precision detectors for SSN, PAN, Aadhaar, Credit Cards (Luhn), IBAN, Phone, Email, and Cloud Auth Keys.
  - Contextual Named Entity Recognition (NER) and Presidio heuristic detectors.
- **Deterministic Policy Rules & Decisions**:
  - HIPAA, GDPR, and PCI-DSS compliance baselines.
  - Granular `KEEP`, `REVIEW`, and `REDACT` decision evaluation.
- **Physical Document Transformation & Redaction**:
  - In-place stream redaction preserving document layout, fonts, and structures without corruption.
  - Direct download endpoint for sanitized artifacts across formats.
- **Re-Identification Risk & Verification QA**:
  - Quasi-identifier linking and k-anonymity risk scoring.
  - 9-point independent post-transformation verification check.
- **Human Review Workspace**:
  - Multi-tenant case triage queue with exclusive 15-minute concurrency leases.
  - Audit trail of authoritative adjudications (`CONFIRM_REDACTION`, `CONFIRM_FINDING`, etc.).
- **Privacy Operations Dashboard**:
  - Real-time document lifecycle distributions, policy outcome breakdowns, PII findings breakdown, and system health status.

---

## 🏗️ System Architecture

```
                                  BROWSER CLIENT (React + Vite + Tailwind CSS)
                                                      │
                                                      ▼
                                       REST API GATEWAY (Express 5.x)
                                                      │
                    ┌─────────────────────────────────┼─────────────────────────────────┐
                    ▼                                 ▼                                 ▼
         [Authentication & RBAC]           [Document Processing]            [Policy & Governance]
         - JWT Access + Refresh            - Extraction & OCR Engine        - Privacy Policy Engine
         - Redis Session Revocation        - PII Detection Service          - Redaction & Transformation
         - Multi-Tenant Isolation          - BullMQ Async Background Tasks   - Human Review Workflows
                    │                                 │                                 │
                    └─────────────────────────────────┼─────────────────────────────────┘
                                                      │
                                    ┌─────────────────┴─────────────────┐
                                    ▼                                   ▼
                            MONGODB 8.x CLUSTER                  REDIS 7.x BROKER
                      (Tenants, Documents, Policies,           (Session Revocation,
                       Decisions, Review Cases, Audits)        BullMQ Task Queues)
```

---

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js & TypeScript
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose)
- **Cache & Queue**: Redis & BullMQ
- **Engines**: pdf-parse, pdf-lib, tesseract.js, docx, xlsx, natural

### Frontend
- **Framework**: React 18 & TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS & Lucide Icons
- **State & Routing**: React Router v6 & Context API

---

## 🏁 Quick Start Guide

### Prerequisites
- Node.js (v18+)
- MongoDB (Running on `127.0.0.1:27017`)
- Redis (Running on `127.0.0.1:6379`)

### 1. Clone the Repository
```bash
git clone https://github.com/Rajasudhan-17/PII.git
cd PII
```

### 2. Backend Setup
```bash
cd backend
npm install
npm run build
# Start development server
npm run dev
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```

### 4. Seed Mock Data & Synthetic Documents
To populate the database with clinical, banking, corporate, and cloud audit documents, policies, and human review cases:
```bash
cd backend
npx ts-node --transpile-only scripts/seed_demo_data.ts
```

### 5. Access the Platform
- **Frontend App**: `http://localhost:5175`
- **Backend API**: `http://localhost:5000`
- **Default Admin**: `admin@pii-platform.local` / `AdminPass123!`
- **Default Reviewer**: `reviewer@pii-platform.local` / `ReviewerPass123!`

---

## 📜 License
Proprietary & Confidential - Built for Privacy Compliance and De-Identification Governance.
