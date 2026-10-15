# PII Intelligent Platform - Backend Foundation & Auth (Phase 01 + Phase 02)

## 1. Project Overview
This repository contains the backend foundation and authentication/authorization infrastructure for the **PII Intelligent Platform**, a scalable system designed for sensitive document understanding, PII detection, redaction, pseudonymization, risk analysis, and audit logging.

**Current Phase**: **PHASE 02 — AUTHENTICATION & AUTHORIZATION**

---

## 2. Backend Architecture

```
                               CLIENT
                                 │
                                 ▼
                       EXPRESS APPLICATION
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
  SECURITY MIDDLEWARE                         AUTHENTICATION ROUTER
  (Helmet, CORS, Rate Limit)                  (/api/v1/auth)
           │                                           │
           ▼                                           ▼
  REQUEST ID MIDDLEWARE                       AUTH CONTROLLERS
  (X-Request-Id UUID v4)                      (Register, Login, Refresh, Me, Logout)
           │                                           │
           ▼                                           ▼
  AUTHENTICATION MIDDLEWARE                   AUTH SERVICES & USER DTO
  (JWT Access Token & Redis Check)            (Bcrypt, JWT Rotation, Audit Log)
           │                                           │
           ▼                                           ├───────────────────┐
  AUTHORIZATION MIDDLEWARE                             ▼                   ▼
  (RBAC Role & Permission Enforcer)                 MONGODB             REDIS
                                                (User Model)      (Token Revocation &
                                                                   Session Tracking)
```

---

## 3. Technology Stack
* **Runtime**: Node.js (v22.x)
* **Language**: TypeScript (v5.x, Strict Mode)
* **Web Framework**: Express.js (v4.x)
* **Database**: MongoDB & Mongoose (v8.x)
* **In-Memory Cache / Event Store**: Redis & ioredis (v5.x)
* **Async Task Queue**: BullMQ (v5.x)
* **Password Hashing**: Bcryptjs (Salt rounds: 12)
* **Tokens & Identity**: JsonWebToken (Access 15m + Refresh 7d with Redis Revocation & Rotation)
* **Containerization**: Docker & Docker Compose
* **Validation**: Zod
* **Logging**: Pino (Structured JSON with PII/Secret Redaction & Security Audit Logs)
* **Testing**: Jest, Supertest & ts-jest

---

## 4. User Model & Account States

### Account States
* `ACTIVE`: Normal operating state.
* `PENDING_VERIFICATION`: Account created, pending email verification.
* `LOCKED`: Temporarily locked due to repeated failed login attempts (5 consecutive failures, 15m duration).
* `DISABLED`: Manually disabled by system administration.

### Database Schema Indexing
* `normalizedEmail`: Unique index, lowercased, trimmed.
* `status`: Indexed for quick status filters.
* `role`: Indexed for authorization queries.

---

## 5. Roles & Permissions (RBAC Matrix)

| Role | Assigned Permissions |
|---|---|
| `USER` | `AUTH_READ`, `USER_READ` |
| `REVIEWER` | `AUTH_READ`, `USER_READ`, `REVIEW_READ`, `REVIEW_EXECUTE` |
| `ANALYST` | `AUTH_READ`, `USER_READ`, `ANALYTICS_READ` |
| `ORG_ADMIN` | `AUTH_READ`, `AUTH_MANAGE`, `USER_READ`, `USER_MANAGE`, `REVIEW_READ`, `REVIEW_EXECUTE`, `ANALYTICS_READ` |
| `SUPER_ADMIN` | All permissions (`SYSTEM_ADMIN` + all above) |

---

## 6. Authentication API Endpoints

* `POST /api/v1/auth/register` — Validates input, verifies password policy, normalizes email, hashes password, creates user document, emits `AUTH_REGISTER_SUCCESS` audit log, returns safe User DTO.
* `POST /api/v1/auth/login` — Authenticates user credentials, handles account lockout logic, sets HttpOnly refreshToken cookie, emits `AUTH_LOGIN_SUCCESS` / `AUTH_LOGIN_FAILURE` audit log, returns user DTO + token pair.
* `POST /api/v1/auth/refresh` — Validates refresh token, checks Redis revocation status, rotates refresh token with token reuse detection, returns new token pair.
* `POST /api/v1/auth/logout` — Revokes refresh token / session in Redis and clears authentication cookies.
* `GET /api/v1/auth/me` — Authenticated profile endpoint returning current user DTO.

---

## 7. Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | Environment stage (`development`, `test`, `production`) | `development` |
| `PORT` | HTTP Server Port | `5000` |
| `API_PREFIX` | Base URI Prefix for API endpoints | `/api/v1` |
| `LOG_LEVEL` | Pino log level (`info`, `debug`, `error`, etc.) | `info` |
| `MONGODB_URI` | MongoDB Connection URI | `mongodb://localhost:27017/pii_platform` |
| `REDIS_URL` | Redis Connection URL | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | Secret key for signing Access JWTs | `[32+ chars secret]` |
| `JWT_REFRESH_SECRET` | Secret key for signing Refresh JWTs | `[32+ chars secret]` |
| `JWT_ACCESS_EXPIRES_IN` | Access token expiration duration | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiration duration | `7d` |
| `MAX_FAILED_LOGIN_ATTEMPTS` | Consecutive failed logins before account lock | `5` |
| `LOCKOUT_DURATION_MINUTES` | Lockout duration in minutes | `15` |
| `SHUTDOWN_TIMEOUT_MS` | Bounded graceful shutdown deadline | `10000` |
| `MAX_MEDIA_DURATION_SECONDS` | Max duration for audio/video media | `3600` |
| `MAX_MEDIA_FRAME_COUNT` | Max frames extracted during video analysis | `300` |
| `MAX_UNCOMPRESSED_ARCHIVE_BYTES` | Decompression bomb guard size limit | `52428800` (50MB) |
| `MAX_IMAGE_DIMENSION_PX` | Max single dimension for image | `10000` |
| `MAX_IMAGE_TOTAL_PIXELS` | Max pixel count for image | `50000000` |

---

## 8. Phase 15 — Production Hardening & Advanced Modalities

### Service Lifecycle & Health Endpoints
* `GET /health/liveness` (alias `/liveness`): Checks process responsiveness independently of database availability. Returns `200 OK`.
* `GET /health/readiness` (alias `/readiness`): Evaluates operational availability of upstream dependencies (MongoDB and Redis). Returns `200 OK` when ready, or `503 Service Unavailable` with degraded dependency states.
* `GET /health/metrics` (alias `/metrics`): Structured telemetry endpoint exposing operational counters, latency distributions, and queue statistics. Never contains raw PII.
* **Bounded Shutdown**: Graceful shutdown handles in-flight connections with a hard bounded 10-second deadline (`SHUTDOWN_TIMEOUT_MS = 10000`) before forceful termination.

### Queue Resiliency & Dead-Letter Handling
* **Stuck-Job Recovery**: Active worker locks enforce `lockDuration: 30000ms`, `maxStalledCount: 2`, and `stalledInterval: 30000ms`.
* **Dead-Letter Queue (`deadLetterQueue`)**: Captures permanently failed jobs after retry exhaustion (3 attempts with exponential backoff) with failure diagnostic context and tenant attribution without leaking sensitive contents.
* **Idempotency**: Jobs use deterministic ID hashing (`jobId: <stage>_<docId>_<checksum>`) to avoid duplicate execution.

### Resource Governance
* **Decompression Bomb Guard**: Enforces max 1,000 entries and 50MB uncompressed limit across all archive extractions (DOCX, PPTX, XLSX).
* **PDF Page Bound**: Enforces maximum of 500 pages per document.
* **Image Dimension Limit**: Maximum 10,000px single dimension and 50,000,000 total pixels.
* **File Upload Limit**: 10MB maximum upload limit enforced at gateway layer.

### Advanced Modalities: Audio & Video
* **Audio Engine (`AudioProcessingEngine`)**:
  - Transcribes speech audio (`mp3`, `wav`, `m4a`, `ogg`, `flac`) into timestamped segments with word-level provenance.
  - Generates PII candidates directly from transcript text with temporal offsets.
  - **Safety Invariant**: When speech transcription is disabled, unavailable, or failed, it returns `NOT_VERIFIABLE` with reason code `TRANSCRIPTION_UNAVAILABLE` — never falsely claiming clean verification.
* **Video Engine (`VideoProcessingEngine`)**:
  - Extracts bounded video frames (`mp4`, `mkv`, `mov`, `webm`) with timestamped metadata.
  - Executes frame OCR and deduplicates adjacent frame detections over temporal spans.
  - Combines frame OCR with optional embedded audio track speech transcription.
  - **Safety Invariant**: Uninspected video frames or partial coverage yields `PARTIAL` or `NOT_VERIFIABLE`.
* **Media Modality Service (`MediaModalityService`)**:
  - Preserves source media files immutably.
  - Strictly enforces multi-tenant scoping (`organizationId`).

---

## 9. Local Development & Testing

### Running Without Docker
```bash
# 1. Install dependencies
npm install

# 2. Typecheck & Build
npm run build

# 3. Start development server
npm run dev
```

### Running Test Suites
```bash
# Run all tests (unit & integration)
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Typecheck & Lint
npm run typecheck
npm run lint
```

