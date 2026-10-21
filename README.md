# ResumeForge - Enterprise-Grade Resume Engineering Platform

ResumeForge is a full-stack web application designed for creating, versioning, tailoring, and compiling professional, ATS-optimized resumes. The platform features real-time client-side rendering, deterministic pagination, headless Chromium PDF compilation, DOCX document ingestion, AI-powered job description matching, security hardening, and an observability subsystem.

---

## 1. System Architecture and Technology Stack

The application is architected as a TypeScript monorepo with strict separation of concerns between client interface, server-side processing, and rendering pipelines.

### Architectural Diagram

```
+-----------------------------------------------------------------------------------------+
|                                    Client Tier (SPA)                                    |
|   React 18  |  TypeScript  |  Vite  |  Tailwind CSS  |  Redux Toolkit  |  TanStack Query|
+--------------------------------------------+--------------------------------------------+
                                             | HTTP / REST (JSON + Cookies)
                                             v
+-----------------------------------------------------------------------------------------+
|                                    Server Tier (API)                                    |
|   Node.js 20  |  Express  |  Helmet Security  |  Rate Limiting  |  Zod Validation       |
+---------------------+----------------------+---------------------+----------------------+
                      |                      |                     |
                      v                      v                     v
+-----------------------------+ +--------------------------+ +----------------------------+
|      Data Persistence       | |    Headless Rendering    | |       AI Integration       |
|  MongoDB 7.0 + Mongoose ORM | | Playwright (Chromium)    | | Google Gemini SDK          |
|  Multi-tenant Scoped Models | | Concurrency-Pooled Queue | | Structured Output (Zod)    |
+-----------------------------+ +--------------------------+ +----------------------------+
```

### Technology Matrix

| Subsystem | Technology | Architectural Role |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 (Vite, TypeScript) | Component architecture, responsive user interface, and state orchestration. |
| **Client State Management**| Redux Toolkit & TanStack Query | Client draft state, optimistic mutations, server cache synchronization. |
| **Styling & Design System**| Tailwind CSS | Semantic layout tokens, dynamic print media queries, typographic hierarchies. |
| **Backend Framework** | Node.js 20 + Express | RESTful API gateway, session lifecycle, document processing pipeline. |
| **Data Layer** | MongoDB 7.0 + Mongoose ORM | Relational document schema, multi-tenant isolation, version trees. |
| **Document Compilation** | Playwright (Headless Chromium) | Isolated headless browser worker pool executing deterministic PDF printing. |
| **AI Engine** | Google Gemini Generative AI SDK | Natural language analysis, job matching, structured schema output. |
| **Schema Validation** | Zod + JSON Schema | Dual-sided input validation, runtime boundaries, and request sanitization. |
| **Containerization** | Docker + Docker Compose | Multi-stage production container, isolated local development stack. |
| **CI/CD Automation** | GitHub Actions | Automated quality gates, Docker build verification, and deployment webhooks. |

---

## 2. Core Subsystems and Functional Capabilities

### Interactive Document Editor and Live Preview
- **Reactive Draft State**: Editor changes are maintained in client memory with immediate visual reflection in the live preview engine.
- **Dynamic Section Ordering**: Flexible drag-and-drop ordering across all resume sections (Experience, Education, Skills, Projects, Certifications, Awards, Languages, and Custom Sections).
- **Advisory Client Validation**: Syntax and formatting checks provide non-blocking visual feedback to prevent interrupting data entry.
- **Autosave with Revision Conflict Detection**: Debounced background persistence automatically syncs drafts with the server using optimistic concurrency controls (`baseRev` counter) to detect concurrent edit collisions.

### Deterministic Multi-Template Rendering
- **Template System**: Five distinct rendering engines (ATS-Standard, Professional, Modern, Minimal, Academic) implemented with custom typographic hierarchies.
- **Page Budgeting and Break Rules**: Content distribution prevents stranded headings (`break-inside: avoid`), preserves short entries across page boundaries, and maintains page count integrity between on-screen preview and printed output.
- **Multi-Format Page Support**: First-class support for both ISO A4 (210 x 297 mm) and North American US Letter (8.5 x 11 inches) page geometries.

### Document Branching and Version Control
- **Point-in-Time Snapshots**: Version trees record complete document state at specific milestones.
- **Non-Destructive Restoration**: Past revisions can be inspected and restored without data loss.
- **Tailored Document Forking**: Users can duplicate base resumes into tailored variants mapped to specific job descriptions without mutating the master record.

### Word Document (DOCX) Ingestion Engine
- **OpenXML Schema Extraction**: Processes `.docx` archives using Mammoth to convert binary runs into structured HTML blocks.
- **Heuristic Section Classification**: Extracts contact details, personal summaries, chronological work history, educational achievements, and skill clusters.
- **Payload Verification**: Inspects PK ZIP signatures and verifies file integrity prior to extraction.

### Headless Chromium PDF Export Pipeline
- **Isolated Worker Queue**: Dedicated job queue managing background browser instances with controlled concurrency limits to prevent memory exhaustion.
- **Print Emulation**: Uses Playwright to load the isolated print route (`/print`), apply print media stylesheets, wait for web font loading (`document.fonts.ready`), and stream binary PDF buffers.
- **Deterministic Job De-duplication**: Identical resume snapshots (content hash matching) return existing finished export jobs instead of re-rendering.
- **Crash Recovery**: Server startup hooks automatically identify and transition orphaned queued/processing jobs to failed status.

### AI-Powered Job Description Tailoring
- **Contextual Gap Analysis**: Evaluates resume content against target job descriptions to compute relevance and keyword coverage metrics.
- **Structured Recommendation Schema**: Enforces strict JSON Schema contracts on LLM responses to ensure reliable parsing of recommendations, keyword additions, and bullet improvements.
- **Automated Fallback and Retry**: Built-in exponential backoff and formatting recovery handles unexpected LLM responses or provider outages.

---

## 3. Security Architecture and Hardening

ResumeForge implements multi-layered security controls covering server validation, header policies, resource boundaries, and multi-tenant authorization.

### Security Controls Matrix

| Threat Vector | Mitigation Strategy | Implementation Details |
| :--- | :--- | :--- |
| **Insecure Direct Object References (IDOR)** | Strict Multi-Tenant Query Scoping | All database operations on resumes, versions, and exports strictly filter by `userId: req.user.id`. Global ID format assertions reject malformed or cross-tenant ObjectIds. |
| **Cross-Site Scripting (XSS) & Clickjacking** | Content Security Policy & Frameguard | Configured Helmet with `frameguard: { action: 'deny' }` and restrictive CSP (`default-src 'self'`). Script execution is restricted to trusted origins. |
| **HTTP Protocol Abuse & MITM** | HSTS & Header Hardening | Enforces HTTP Strict Transport Security (HSTS) with 1-year max-age, `includeSubDomains`, and `preload` in production. Disables `X-Powered-By`. |
| **Denial of Service (DoS) via Flooding** | Tiered Rate Limiting | Global API limiter (300 req / 15 min), dedicated authentication limiter (30 req / 15 min), password mutation limiter (10 req / 15 min), and import limiter (25 req / 15 min). |
| **Resource Exhaustion & Zip Bombs** | Request Size & Parse Bounds | Request bodies capped at 500 KB (JSON) and 100 KB (URL-encoded). DOCX parser rejects archives generating over 500,000 characters of HTML or exceeding 2,000 structural blocks. |
| **Server-Side Request Forgery (SSRF)** | IP Filtering & Scheme Validation | URL validator rejects pseudoprotocols (`javascript:`, `data:`, `file:`, `blob:`). Safe fetch engine blocks private IPv4 (10/8, 172.16/12, 192.168/16, 127/8), link-local/cloud metadata (169.254.169.254), and IPv6 loopback/ULA. |
| **Path Traversal & Header Splitting** | Filename & Path Sanitization | `sanitizeFilename` strips traversal sequences (`../`, `..\`), control characters, null bytes, and Windows device names (`CON`, `PRN`, `AUX`, `NUL`). `Content-Disposition` header generation strips CRLF characters. |
| **Credential & PII Exposure in Logs** | Multi-Pass Sanitization Engine | Custom log pipeline redacts passwords, bearer tokens, JWT signatures, and MongoDB URIs. Personal information (emails, phone numbers, SSNs, credit cards) is automatically masked. |

---

## 4. Observability, Telemetry, and Diagnostics

The system includes a built-in observability subsystem that provides structured logging, latency tracking, error categorization, and health reporting without external agent dependencies.

### Telemetry Subsystems

```
+-----------------------------------------------------------------------------------------+
|                                Request Observability                                    |
|   X-Request-Id Correlation  -->  AsyncLocalStorage Context  -->  Structured JSON Output |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                                   Metrics Registry                                      |
|  - API Latencies (p50, p95, min, max, avg)     - HTTP Status Breakdown (2xx, 3xx, 4xx, 5xx)
|  - PDF Generation Duration & Active Pool Count - PDF Failures Categorized by Cause      |
|  - AI Tool Invocation Duration & Failure Codes - Circular Error Tracking Buffer         |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                                Diagnostics Endpoints                                   |
|   GET /api/health (System status, memory, database, queue, and active alerts)          |
|   GET /api/metrics (Full JSON metrics snapshot and endpoint performance stats)          |
+-----------------------------------------------------------------------------------------+
```

### Diagnostic Endpoints

#### `GET /api/health`
Returns operational health status, resource utilization, subsystem readiness, and active alert conditions:
```json
{
  "ok": true,
  "status": "healthy",
  "uptime": 1420,
  "timestamp": "2026-10-21T15:45:00.000Z",
  "checks": {
    "database": {
      "status": "up",
      "readyState": 1
    },
    "memory": {
      "heapUsedMB": 48,
      "heapTotalMB": 72,
      "rssMB": 115
    },
    "pdf": {
      "activeRenders": 0,
      "queueLength": 0
    },
    "ai": {
      "configured": true
    }
  },
  "alerts": []
}
```

#### `GET /api/metrics`
Returns rolling statistical summaries, percentile latencies, and error categorization counters:
- **API Request Metrics**: Total request count, status code distribution (2xx, 3xx, 4xx, 5xx), overall error rate percentage, and server error rate percentage.
- **Latency Percentiles**: Computes `p50` (median) and `p95` response times across all traffic and for specific endpoints (`POST /api/auth/login`, `GET /api/resumes`, `POST /api/resumes/:id/exports`, `POST /api/tailor`, etc.).
- **PDF Export Metrics**: Total renders, active worker count, success/failure counts, duration percentiles, and categorized failures (`BROWSER_LAUNCH_ERROR`, `NETWORK_UNREACHABLE`, `TIMEOUT`, `RENDER_CRASH`, `UNKNOWN_ERROR`).
- **AI Telemetry**: Total tool invocations, duration percentiles, and categorized failure codes (`AI_AUTH`, `AI_BUSY`, `AI_UNREACHABLE`, `AI_FORMAT`, `AI_NOT_CONFIGURED`, `AI_ERROR`).
- **Error Tracking**: Circular buffer storing the last 50 sanitized application exceptions with associated request IDs.

### Automated Alerting Rules

The metrics registry continuously evaluates internal metrics against operational thresholds:
1. `HIGH_5XX_ERROR_RATE`: Triggers critical alert if 5xx responses exceed 5% of total requests (sample size >= 10).
2. `HIGH_API_LATENCY`: Triggers warning alert if overall API `p95` latency exceeds 2,000 ms (sample size >= 10).
3. `PDF_FAILURE_SPIKE`: Triggers warning alert if PDF generation failure rate exceeds 25% (sample size >= 4).
4. `AI_FAILURE_SPIKE`: Triggers warning alert if AI service failure rate exceeds 30% (sample size >= 5).
5. `DATABASE_DOWN`: Triggers critical alert when MongoDB connection state is disconnected.
6. `HIGH_MEMORY_PRESSURE`: Triggers warning alert when Node.js heap usage exceeds 88% of allocated heap.

---

## 5. Performance Measurements and Benchmarks

Benchmarks were measured in containerized runtime environments (Node.js 20, Debian Linux, 2 vCPU, 2 GB RAM).

### Latency and Processing Benchmarks

| Operation / Endpoint | Sample Count | p50 Latency | p95 Latency | Success Rate | Resource Profile |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /api/health` | 1,000 requests | 2.1 ms | 5.8 ms | 100.0% | CPU < 1%, Memory constant |
| `POST /api/auth/login` | 500 requests | 48.0 ms | 62.0 ms | 100.0% | CPU 8% (bcrypt 10 rounds) |
| `GET /api/resumes` | 1,000 requests | 18.5 ms | 34.2 ms | 100.0% | Indexed query on `userId` |
| `PATCH /api/resumes/:id` (Autosave) | 1,000 requests | 22.0 ms | 41.5 ms | 100.0% | Document revision validation |
| `POST /api/import/docx` | 100 files (10-50 KB) | 85.0 ms | 145.0 ms | 100.0% | Heap delta < 12 MB |
| PDF Export: 1-Page Resume | 100 renders | 1,280 ms | 1,650 ms | 100.0% | Headless Chromium instance |
| PDF Export: 3-Page Dense Resume | 50 renders | 1,850 ms | 2,420 ms | 100.0% | Headless Chromium instance |

---

## 6. Testing Architecture and Verification Results

The test suite covers unit logic, integration flows, failure modes, security mitigations, and end-to-end workflows. Tests run using Vitest with isolated MongoDB instances.

### Test Results Summary

```
================================================================================
Test Execution Summary
================================================================================
Test Files  : 17 passed (17 total, 100% passing)
Total Tests : 169 passed (169 total, 100% passing)
Duration    : ~105 seconds (includes Playwright Chromium browser launch runs)
================================================================================
```

### Test Suite Directory Structure

```
server/tests/
|-- unit/
|   |-- resume-schema.test.ts             (17 tests: Schema validation, field bounds, URL rules)
|   |-- section-ordering-visibility.test.ts (7 tests: Reordering, toggles, empty section rules)
|   |-- versioning.test.ts                (6 tests: Snapshot creation, delta checks, restore)
|   |-- template-rules.test.ts            (11 tests: Layout engines, typography, pagination)
|   |-- job-matching-quality.test.ts      (12 tests: Match scoring, skill gap extraction)
|   |-- security.test.ts                  (16 tests: Path traversal, SSRF, filename sanitization)
|   |-- observability.test.ts             (13 tests: PII scrubbing, metrics, p50/p95, alerts)
|-- integration/
|   |-- auth.test.ts                      (10 tests: Session cookies, bcrypt, cross-user isolation)
|   |-- autosave-conflicts.test.ts        (5 tests: Stale revision conflict rejection, recovery)
|   |-- pdf-export-failure.test.ts        (10 tests: Concurrency queue, timeout handling, recovery)
|   |-- ai-provider-failures.test.ts      (6 tests: Auth failures, 429 backoff, schema fallback)
|   |-- import-parsing.test.ts            (7 tests: DOCX structure parsing, corrupt zip rejection)
|   |-- security-hardening.test.ts        (6 tests: Secure headers, request limits, IDOR checks)
|   |-- observability.test.ts             (4 tests: Request ID header, /api/health, /api/metrics)
|-- e2e/
|   |-- e2e-workflow.test.ts              (8 tests: Registration, editing, versioning, PDF export)
|-- pdf.test.ts                           (19 tests: Playwright layout, links, visual regression)
|-- tailor.test.ts                        (12 tests: AI client mapping, payload bounds)
```

---

## 7. Containerization and Local Development

ResumeForge provides multi-stage production Docker images and local multi-container Docker Compose stacks.

### Local Multi-Container Stack (Docker Compose)

The multi-container setup launches the frontend (Nginx), backend API (Node + Playwright), and a local MongoDB instance:

```bash
# Clone the repository
git clone https://github.com/Akshay448591/ResumeForge.git
cd ResumeForge

# Build and start all services in detached mode
docker-compose up -d --build

# Inspect running container status
docker-compose ps

# Tail runtime logs
docker-compose logs -f

# Shut down containers and retain volumes
docker-compose down
```

#### Local Port Bindings
- **Web Application (Nginx + Client SPA)**: `http://localhost:80`
- **Backend API Gateway**: `http://localhost:5000`
- **MongoDB Database**: `localhost:27017`

### Unified Production Container Build

For container hosting platforms (Render, Railway, Fly.io, AWS ECS), the root `Dockerfile` packages the client, server, and Playwright Chromium into a single image:

```bash
# Build the unified production container
docker build -t resumeforge:latest .

# Run container locally with environment configuration
docker run -d \
  -p 10000:10000 \
  -e PORT=10000 \
  -e NODE_ENV=production \
  -e MONGODB_URI="mongodb://host.docker.internal:27017/resumeforge" \
  -e JWT_SECRET="your-secure-random-secret-key-32-chars" \
  --name resumeforge-prod \
  resumeforge:latest
```

---

## 8. Continuous Integration and Continuous Deployment (CI/CD)

The repository includes a GitHub Actions workflow (`.github/workflows/ci-cd.yml`) executing quality verification, container build validation, and deployment triggers.

### Pipeline Workflow Stages

```
[Push to main / Pull Request]
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Quality Gate Job                                         │
│    - Checkout code & configure Node.js 20                   │
│    - Install dependencies (npm ci)                          │
│    - Run static analysis (npm run lint)                     │
│    - Verify TypeScript compilation (npm run typecheck)      │
│    - Install Playwright Chromium dependencies               │
│    - Execute full test suite: 17 suites, 169 tests          │
└──────────────────────────────┬──────────────────────────────┘
                               │ (On success)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Docker Validation Job                                    │
│    - Configure Docker Buildx                                │
│    - Build production multi-stage image                     │
│    - Verify build artifacts and dependencies compile cleanly│
└──────────────────────────────┬──────────────────────────────┘
                               │ (On success & branch == main)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Automated Deployment Job                                 │
│    - Call Render Deploy Hook URL via secure webhook         │
│    - Verify deployment request accepted                     │
│    - Render pulls image, starts container, updates live URL │
└─────────────────────────────────────────────────────────────┘
```

### Configuring Automated Deployment

1. Retrieve your Deploy Hook URL from the **Render Dashboard** (**Web Service** -> **Settings** -> **Deploy Hook**).
2. In your **GitHub Repository**, open **Settings** -> **Secrets and variables** -> **Actions**.
3. Create a repository secret named `RENDER_DEPLOY_HOOK_URL` containing the deploy hook URL.
4. Every commit pushed to `main` executes the quality pipeline and triggers an automated deployment to your production URL.

---

## 9. Environment Configuration Reference

The following environment variables configure the application:

| Variable | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | No | `development` | Runtime environment (`development`, `production`, `test`). |
| `PORT` | Number | No | `4000` (Dev) / `10000` (Prod) | Network port for the Express application server. |
| `MONGODB_URI` | String | Yes | `mongodb://127.0.0.1:27017/resumeforge` | MongoDB connection URI with credentials and database name. |
| `JWT_SECRET` | String | Yes | None | Cryptographic secret for signing session authentication cookies (minimum 16 characters). |
| `GEMINI_API_KEY` | String | No | None | API key for Google Gemini generative AI features. |
| `GEMINI_MODEL` | String | No | `gemini-3.8-flash` | Gemini foundation model identifier for document tailoring. |
| `PRINT_BASE_URL` | String | No | Auto-detected | Base URL accessed by Playwright headless browser for PDF rendering. |
| `CHROMIUM_ARGS` | String | No | `--no-sandbox --disable-setuid-sandbox` | Command-line arguments passed to Chromium in container environments. |

---

## 10. API Specification Reference

All API routes are prefixed with `/api`. Authenticated endpoints require a valid session JWT cookie.

### Health and Diagnostics
- `GET /api/health` - Subsystem diagnostic status, database connection, memory usage, queue depth, and alerts.
- `GET /api/metrics` - Latency percentiles (p50/p95), status code distributions, PDF failure counts, and AI telemetry.

### Authentication
- `POST /api/auth/register` - Create user account and issue authenticated session cookie.
- `POST /api/auth/login` - Authenticate user credentials and establish session.
- `POST /api/auth/logout` - Invalidate session and clear authentication cookie.
- `GET /api/auth/me` - Retrieve authenticated user profile.
- `PATCH /api/auth/me/password` - Update account password (rate-limited).

### Resume Operations
- `GET /api/resumes` - List resumes owned by authenticated user.
- `POST /api/resumes` - Initialize a new resume draft.
- `GET /api/resumes/:id` - Retrieve complete resume document by identifier.
- `PATCH /api/resumes/:id` - Update resume content with optimistic concurrency control (`baseRev`).
- `DELETE /api/resumes/:id` - Delete resume and associated export records.
- `POST /api/resumes/:id/duplicate` - Create independent copy of an existing resume.

### Version Management
- `GET /api/resumes/:id/versions` - List historical versions for a resume.
- `POST /api/resumes/:id/versions` - Snapshot current resume state into a named version.
- `POST /api/resumes/:id/versions/:versionId/restore` - Restore resume state to a historical version.

### Document Export Pipeline
- `POST /api/resumes/:id/exports` - Enqueue asynchronous PDF compilation job.
- `GET /api/resumes/:id/exports/:jobId` - Poll export job status, page count, and byte size.
- `GET /api/resumes/:id/exports/:jobId/download` - Stream compiled binary PDF file (`application/pdf`).

### Document Ingestion and AI Tailoring
- `POST /api/import/docx` - Upload and parse Microsoft Word document into resume schema (multipart/form-data).
- `POST /api/tailor/analyze` - Analyze resume content against target job description for match scoring and gap analysis.
