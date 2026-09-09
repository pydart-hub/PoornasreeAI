# PoornasreeAI — Master Architecture & Technical Handover Blueprint

> **Platform**: PoornasreeAI  
> **Customer Support Line**: WhatsApp `+91 94009 61291`  
> **Target Audience**: Technical Architects, Engineering Leads, Backend & Frontend Developers, System Administrators  
> **Stack**: Next.js 14 · Express 5 · PostgreSQL 16 · Prisma ORM · Qdrant Vector DB · Groq (Llama 3.3 / 3.1) · Meta WhatsApp Cloud API · Docker Compose · Nginx  

---

## 1. Executive Summary & System Overview

**PoornasreeAI** is an enterprise-grade service management and automated customer support ecosystem built for **Poornasree Equipments** (manufacturers of milk testing and dairy equipment including Lactosure, Lactogrand, Stirrers, and Centrifuges).

The system automates the complete field service lifecycle:
1. **WhatsApp-Driven First-Touch**: Customers interact via WhatsApp without needing a separate mobile app or web login.
2. **AI-Powered Troubleshooting**: Natural language classification, document-grounded RAG (Retrieval-Augmented Generation), and interactive step-by-step diagnostic flows.
3. **Machine Fleet Auto-Discovery**: Automatic identification and matching of customer serial numbers, warranty validation, and customer registration.
4. **Intelligent Service Ticketing & Pincode Routing**: Automatic ticket generation and dispatch to the responsible regional service engineer or dealer based on Indian pincode zones.
5. **On-Site Field Verification via Customer OTP**: Field engineers cannot close tickets arbitrarily; closure requires a real-time OTP verified on the customer's WhatsApp.
6. **Automated Feedback & SLA Logging**: Immediate interactive CSAT star rating collection and SLA compliance metrics.
7. **Unified Multi-Role Operations Web Portal**: Unified role-based access for Super Admins, System Admins, Service Managers, Assistant Managers, Field Engineers, Dealers, Customer Support Agents, Sales, and Marketing teams.

---

## 2. High-Level System Architecture

```mermaid
flowchart TD
    subgraph Clients["External & Internal Clients"]
        Customer["Customer<br/>(WhatsApp App)"]
        StaffBrowser["Internal Staff<br/>(Desktop / Mobile Web)"]
        EngineerWA["Service Engineer<br/>(WhatsApp Alerts)"]
    end

    subgraph Ingress["Ingress & Edge Security"]
        Nginx["Nginx Reverse Proxy<br/>Port 80 / 443 (SSL)<br/>ai.poornasreecloud.com"]
        CloudAPI["Meta WhatsApp Cloud API<br/>graph.facebook.com"]
    end

    subgraph Application["PoornasreeAI Application Stack"]
        Web["Next.js 14 Web Frontend<br/>Host: 3000 / Internal: 3002<br/>App Router · Tailwind CSS"]
        API["Express 5 Backend API<br/>Host: 4000 / Internal: 4002<br/>Node.js · TypeScript"]
        SocketIO["Socket.IO Server<br/>Real-time Live Chat & Alerts"]
    end

    subgraph Data["Persistence & Vector Layer"]
        Postgres[("PostgreSQL 16 DB<br/>Prisma ORM<br/>Relational Data")]
        Qdrant[("Qdrant Vector DB<br/>Port 6333<br/>Service Docs Embeddings")]
    end

    subgraph ExternalAI["External AI & Automation Services"]
        Groq["Groq Cloud LLM<br/>Llama 3.3 70B & 3.1 8B"]
        Gemini["Google Gemini API<br/>Dual LLM Fallback"]
        gTTS["Google TTS Service<br/>Indian Audio Voice"]
        N8N["n8n Automation Engine<br/>Port 5678"]
    end

    Customer <-->|Encrypted Chat| CloudAPI
    CloudAPI <-->|Webhooks / Messages| API
    StaffBrowser <-->|HTTPS| Nginx
    Nginx -->|Proxy /| Web
    Nginx -->|Proxy /api| API
    Nginx -->|Proxy /socket.io| SocketIO
    Web <-->|Internal API / Rewrites| API

    API <-->|SQL Queries / Migrations| Postgres
    API <-->|Semantic Search| Qdrant
    API <-->|Inference & Classification| Groq
    API -.->|Failover| Gemini
    API -->|Text to Speech| gTTS
    API -.->|Lifecycle Webhooks| N8N
    API -->|WhatsApp Alerts| EngineerWA
```

---

## 3. User Roles, Default Credentials & Access Matrix

All web portals are protected with JWT authentication and accessible via the unified login page at `/login`.

### Seeded Credentials Table

| # | Role Key | Role Name | Default Email | Default Password | Portal Route | Key Capabilities |
|---|---|---|---|---|---|---|
| 1 | `super_admin` | **Super Admin** | `superadmin@poornasree.com` | `SuperAdmin@1234` | `/super-admin` | Runtime settings, LLM API keys, token telemetry, WhatsApp billing, health monitor |
| 2 | `admin` | **System Administrator** | `admin@poornasree.com` | `Admin@1234` | `/admin` | User management, product catalogue, R&D videos, troubleshooting templates, document vector ingestion |
| 3 | `service_manager` | **Service Manager** | `manager@poornasree.com` | `Manager@1234` | `/service-manager` | Geographic routing, ticket dispatch, SLA tracking, engineer workload, drawer inspection |
| 4 | `assistant_service_manager` | **Asst. Service Manager** | `assistant_manager@poornasree.com` | `Assistant@1234` | `/assistant-manager` | Operational ticket monitoring, status verification, ticket escalations |
| 5 | `service_engineer` | **Field Service Engineer** | `engineer1@poornasree.com`<br/>`engineer2@poornasree.com`<br/>`engineer3@poornasree.com` | `Engineer@1234` | `/service` | Field ticket list, issue details, customer calling, OTP verification trigger, work reports, R&D/training video library |
| 6 | `dealer` | **Authorized Dealer** | `dealer@poornasree.com` | `Dealer@1234` | `/dealer` | Customer machine registration, warranty claim requests, dealer work reports |
| 7 | `customer_support` | **Customer Support Agent** | `support@poornasree.com` | `Support@1234` | `/support-dashboard` | Live chat takeover (Bot pause), live agent response, ticket escalation |
| 8 | `customer_service` | **Customer Service** | `customerservice@poornasree.com` | `Service@1234` | `/customer-service` | General customer queries and ticket reviews |
| 9 | `sales` | **Sales Representative** | `sales@poornasree.com` | `Sales@1234` | `/sales` | Equipment inquiries, customer quotes, lead tracking |
| 10 | `marketing` | **Marketing Specialist** | `marketing@poornasree.com` | `Marketing@1234` | `/marketing` | WhatsApp promotional broadcast campaigns, audience filtering |
| 11 | `customer` | **End Customer** | `customer@example.com` | `Customer@123` | `/dashboard` | Machine registry overview (Primary channel is WhatsApp) |

---

## 4. End-to-End User Journeys

### 4.1 Customer WhatsApp Journey (The Core Loop)

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant WA as Meta WhatsApp Cloud API
    participant Bot as Express WhatsApp Service
    participant AI as Groq / Vector Engine
    participant DB as PostgreSQL (Prisma)
    actor E as Service Engineer
    actor M as Service Manager

    C->>WA: "Hi / My stirrer is not working"
    WA->>Bot: Webhook POST /api/whatsapp/webhook
    Bot->>DB: Lookup Customer by Phone Number
    alt Known Customer
        Bot->>C: "Welcome back, {Name}! Here are your registered machines..."
    else New Customer
        Bot->>C: "Welcome to Poornasree Equipments! Let's get you set up."
    end

    C->>Bot: Selects Machine & Explains Issue
    Bot->>AI: Vector Search (Qdrant) + Groq Classification
    AI-->>Bot: Diagnostic Check & Action Steps
    Bot->>C: Interactive Step: Check power & cable.<br/>[ ✅ Resolved ] [ ❌ Unresolved ]

    alt Customer clicks Resolved
        Bot->>C: "Glad we could help! Have a great day."
    else Customer clicks Unresolved
        Bot->>C: "Initiating Service Ticket. Please share your Location / Pincode."
        C->>Bot: "Pincode: 600001, Anna Nagar"
        Bot->>DB: Auto-create Ticket (Status: OPEN)<br/>Match Pincode to Engineer
        Bot->>DB: Assign Ticket to Suresh Nair (Status: ASSIGNED)
        Bot->>C: "Ticket #TKT-20260317-001 created. Assigned to engineer Suresh Nair."
        Bot->>E: WhatsApp Alert: "New Ticket assigned in your area #TKT-..."
        Bot->>M: Socket.IO Event: Ticket Created & Assigned
    end

    Note over E,C: Engineer visits customer site
    E->>Bot: PATCH /api/tickets/:id/start (IN_PROGRESS)
    E->>Bot: POST /api/tickets/:id/otp (Request OTP)
    Bot->>C: WhatsApp Message: "Your Service OTP is 4829. Share with engineer only after work is done."
    C->>E: Gives code "4829"
    E->>Bot: POST /api/tickets/:id/verify-otp { code: 4829 }
    Bot->>C: "Service Complete! Please rate our service:<br/>[ ⭐⭐⭐⭐⭐ ] [ ⭐⭐⭐ ] [ ⭐ ]"
    C->>Bot: Rating: 5 Stars
    Bot->>DB: Save CSAT Rating & Feedback
    Bot->>C: CTA URL Button: "Rate us on Google ⭐" (Rating >= 3)
```

---

## 5. Conversational State Machine (FSM)

Customer sessions are managed via `ConversationSession` in PostgreSQL to ensure deterministic conversational states:

```mermaid
stateDiagram-v2
    [*] --> GREETING : Incoming WhatsApp Message
    GREETING --> MAIN_MENU : Customer recognized / Welcome sent
    MAIN_MENU --> PRODUCT_SELECT : "Troubleshoot" chosen
    PRODUCT_SELECT --> TROUBLESHOOTING : Machine selected / Serial verified
    TROUBLESHOOTING --> COMPLETED : Customer clicks [ ✅ Resolved ]
    TROUBLESHOOTING --> ESCALATION_NAME : Customer clicks [ ❌ Unresolved ] (New user)
    TROUBLESHOOTING --> ESCALATION_SERIAL : Known user with unlinked machine
    ESCALATION_NAME --> ESCALATION_PLACE : Name provided
    ESCALATION_PLACE --> ESCALATION_PINCODE : Place provided
    ESCALATION_PINCODE --> ESCALATION_SERIAL : Valid 6-digit Pincode validated
    ESCALATION_SERIAL --> COMPLETED : Ticket Created & Engineer Dispatched
    COMPLETED --> [*]

    state LIVE_SUPPORT_INTERCEPT {
        TROUBLESHOOTING --> AGENT_ACTIVE : Customer requests Human Agent
        AGENT_ACTIVE --> [*] : Support closes session / Bot resumes
    }
```

---

## 6. Relational Database Schema & Entity Relationships

The relational architecture is defined in `api/prisma/schema.prisma` and backed by PostgreSQL 16:

```mermaid
erDiagram
    User ||--o{ Ticket : "customer / engineer / manager"
    User ||--o{ Pincode : "assigned zones"
    User ||--o{ WorkReport : "dealer reports"
    User ||--o{ Document : "uploaded files"
    User ||--o{ RdVideo : "uploaded R&D videos"

    Ticket ||--o| WorkReport : "field resolution"
    Ticket }o--|| Pincode : "location routing"
    Ticket ||--o{ SupportRequest : "support escalation"

    WorkReport ||--o{ ReplacedPart : "parts replaced"
    WorkReport ||--o{ WorkReportImage : "part photos"

    Document ||--o{ DocumentChunk : "vector chunks"
    Document ||--o{ DocumentIssue : "extracted troubleshooting"
    DocumentIssue ||--o{ DocumentIssueStep : "ordered steps"

    ConversationSession ||--o{ SimulateMessage : "chat history"
    BrandingCampaign ||--o{ BrandingCampaignLead : "broadcast status"
    MarketingLead ||--o{ BrandingCampaignLead : "recipients"

    User {
        string id PK
        string email UK
        string passwordHash
        string firstName
        string lastName
        string role
        string whatsappNumber
        string setPasswordToken
        string pincodeId FK
        string managerId FK
    }

    Ticket {
        string id PK
        string ticketNumber UK
        string customerId FK
        string assignedEngineerId FK
        string assignedManagerId FK
        string assignedDealerId FK
        string pincodeId FK
        enum status "OPEN, ASSIGNED, IN_PROGRESS, PENDING_OTP, CLOSED"
        string otpCodeHash
        datetime otpExpiresAt
        boolean otpVerified
        int feedbackRating
        string problemDescription
        string machineSerialNumber
    }

    WorkReport {
        string id PK
        string ticketId UK, FK
        string dealerId FK
        string problemDiagnosed
        string workDone
        boolean warrantyClaimRequested
    }

    Pincode {
        string id PK
        string code UK
        string place
        string district
        string state
    }

    LlmUsageLog {
        string id PK
        string provider
        string model
        string feature
        int promptTokens
        int completionTokens
        int totalTokens
        datetime createdAt
    }

    WhatsAppMessageLog {
        string id PK
        string waMessageId UK
        string recipientPhone
        string direction
        string messageType
        string status
        float costInr
        float costUsd
    }
```

---

## 7. AI & Multimodal RAG Pipeline

```mermaid
flowchart LR
    subgraph Ingestion["Document Ingestion Pipeline"]
        Upload["Admin Uploads<br/>PDF / DOCX / XLSX"]
        Parse["Document Parser<br/>(mammoth / pdf-parse / exceljs)"]
        Chunk["Semantic Chunker<br/>(500-1000 tokens + overlap)"]
        Embed["Vector Embedder<br/>(Ollama nomic-embed-text)"]
        QdrantStore[("Qdrant Vector DB<br/>'documents' Collection")]

        Upload --> Parse --> Chunk --> Embed --> QdrantStore
    end

    subgraph Query["Runtime Retrieval & Inference"]
        CustQuery["Customer Message<br/>(WhatsApp / Web)"]
        Search["Vector Cosine Search<br/>(Qdrant top_k = 3)"]
        Context["Prompt Synthesizer<br/>(Document chunks + User history)"]
        LLM["Groq Llama 3.3 70B<br/>(Fallback: Gemini)"]
        Answer["Structured Diagnostic Response<br/>(Check, Action, Buttons)"]

        CustQuery --> Search
        QdrantStore -.-> Search
        Search --> Context
        Context --> LLM --> Answer
    end
```

### Voice & Speech Services:
- **Incoming Audio (WhatsApp Voice Notes)**: Audio downloaded via Meta Cloud API, converted if needed, and transcribed using Groq Whisper.
- **Text-to-Speech (`/api/tts`)**: Server-side proxy utilizing `node-gtts` to generate native audio for Indian languages (`en`, `hi`, `mr`, `bn`, `te`).

---

## 8. Deployment & DevOps Architecture

### Multi-Container Topology (`docker-compose.yml`)

```
                  ┌───────────────────────────────────────────────┐
                  │                 Host Machine                  │
                  │                                               │
                  │   Nginx Reverse Proxy (Host :80 / :443 SSL)   │
                  └───────┬───────────────────────────────┬───────┘
                          │ :3000                         │ :4000
                          ▼                               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                     Docker Internal Bridge                  │
    │                                                             │
    │   ┌────────────────┐      ┌─────────────────────────────┐   │
    │   │  web (Next.js) │ <--> │  api (Express 5 + Prisma)   │   │
    │   └────────────────┘      └──────────────┬──────────────┘   │
    │                                          │                  │
    │             ┌────────────────────────────┼──────────────┐   │
    │             │ :5432                      │ :6333        │   │
    │             ▼                            ▼              │   │
    │   ┌────────────────────┐      ┌─────────────────────┐   │   │
    │   │ db (PostgreSQL 16) │      │ qdrant (Vector DB)  │   │   │
    │   └────────────────────┘      └─────────────────────┘   │   │
    │                                          │              │   │
    │                                          │ :11434       │   │
    │                                          ▼              │   │
    │                               ┌─────────────────────┐   │   │
    │                               │  ollama (Embeddings)│   │   │
    │                               └─────────────────────┘   │   │
    │                                                         │   │
    │   ┌─────────────────────────────────────────────────┐   │   │
    │   │  n8n (Workflow Automation on Host :5678)        │   │   │
    │   └─────────────────────────────────────────────────┘   │   │
    └─────────────────────────────────────────────────────────────┘
```

### Port Mapping Summary

| Service | Internal Port | Host Port | Exposure | Description |
|---|---|---|---|---|
| `web` | `3000` | `127.0.0.1:3000` (or `3002`) | Proxied by Nginx | Next.js frontend UI |
| `api` | `4000` | `127.0.0.1:4000` (or `4002`) | Proxied by Nginx | Express backend REST & Socket.IO |
| `db` | `5432` | None (Internal) | Docker Network | PostgreSQL 16 database |
| `qdrant` | `6333` | None (Internal) | Docker Network | Vector search database |
| `ollama` | `11434` | None (Internal) | Docker Network | Local embeddings / LLM container |
| `n8n` | `5678` | `127.0.0.1:5678` (or `5679`) | Direct / Nginx | Workflow automation |

---

## 9. Developer & Operational Playbook

### 9.1 Fresh Installation & Local Bootstrap

```bash
# 1. Clone repository
git clone <repository_url>
cd PoornasreeAI

# 2. Configure Environment Files
cp .env.example .env
cp api/.env.example api/.env

# 3. Install dependencies
npm install
cd api && npm install && cd ..

# 4. Initialize Database & Run Migrations
cd api
npx prisma migrate deploy
npx prisma db seed
cd ..

# 5. Launch Full Stack in Development Mode
npm run dev
```

### 9.2 Production Deployment on VPS

Follow the detailed instructions in **[docs/DEPLOY-RUNBOOK.md](DEPLOY-RUNBOOK.md)**:

```bash
# On Remote Linux VPS:
cd /var/www/PoornasreeAI
git pull origin main
./deploy.sh quick-api   # To rebuild and restart backend only
./deploy.sh quick       # To rebuild and restart frontend only
./deploy.sh full        # Full restart including migrations
```

### 9.3 Resetting Super Admin Password

If the super admin credentials are ever lost or locked:
```bash
cd api
npx ts-node --transpile-only src/scripts/ensure-super-admin.ts
```
This restores `superadmin@poornasree.com` with `SuperAdmin@1234`.

---

## 10. Security & Compliance Checklist

- **Secrets Handling**: All production secrets are kept in `.env` and excluded from git.
- **Dynamic Configuration**: Super Admin can override API keys directly in the database with AES-GCM encryption (`SystemSetting` table).
- **OTP Tamper Prevention**: OTP codes are stored as SHA-256 hashes (`otpCodeHash`) with 15-minute expirations and a maximum attempt rate limiter.
- **Role Guards**: Backend API routes strictly enforce role authorization via `protect` and `requireRole(...)` middleware.
- **CORS & Proxying**: Direct browser-to-backend access is restricted; all external traffic routes cleanly through Next.js proxy rewrites or Nginx.
