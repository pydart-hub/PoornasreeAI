# PoornasreeAI

Enterprise WhatsApp-driven service management platform for **Poornasree Equipments** — customer AI chat, automated ticketing, pincode-based engineer assignment, customer OTP signoff, and unified multi-tier operational web portals.

---

## 🚀 Technology Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) + React 18 | Role-based responsive web dashboards, Tailwind CSS, Lucide icons, Recharts |
| **Backend API** | Node.js + Express 5 + TypeScript | RESTful endpoints, WebSockets (Socket.IO), node-cron scheduled tasks |
| **Database** | PostgreSQL 16 via Prisma ORM | Relational schema with 22 models, transactions, migrations, and seed scripts |
| **Vector Engine** | Qdrant Vector DB | High-performance embedding similarity search for RAG-based troubleshooting |
| **AI / LLMs** | Groq (Llama 3.3 70B & 3.1 8B) + Gemini | Fast conversational agent, Whisper audio STT, and Google gTTS Indian languages |
| **WhatsApp** | Meta WhatsApp Cloud API | Automated customer troubleshooting, machine fleet lookup, interactive buttons, alerts |
| **Orchestration** | Docker Compose + Nginx Reverse Proxy | Production containerization, SSL termination, and host security watchdogs |

---

## 👥 User Roles, Default Credentials & Access Matrix

All portals are authenticated via JWT cookies and unified login at `/login`. Running `npx prisma db seed` in `api/` seeds the following standard accounts:

| User Role | Default Email | Default Password | Portal Route | Primary Responsibilities |
|---|---|---|---|---|
| 👑 **Super Admin** | `superadmin@poornasree.com` | `SuperAdmin@1234` | `/super-admin` | System keys, LLM API configs, WhatsApp/LLM billing telemetry, server health |
| 🛡️ **Admin** | `admin@poornasree.com` | `Admin@1234` | `/admin` | User management, product catalogue, document vector ingestion, training videos |
| 📋 **Service Manager** | `manager@poornasree.com` | `Manager@1234` | `/service-manager` | SLA tracking, ticket board, pincode routing, engineer assignment & reassignments |
| 🗂️ **Asst. Service Manager** | `assistant_manager@poornasree.com` | `Assistant@1234` | `/assistant-manager` | Operational ticket reviews and delegated queue supervision |
| 🔧 **Service Engineer** | `engineer1@poornasree.com` | `Engineer@1234` | `/service` | Field ticket checklist, on-site OTP verification, work reports, training videos |
| 🏬 **Dealer** | `dealer@poornasree.com` | `Dealer@1234` | `/dealer` | Customer machine registration, warranty claim requests, dealer work reports |
| 🎧 **Customer Support** | `support@poornasree.com` | `Support@1234` | `/support-dashboard` | Live chat takeover, WhatsApp bot pause/resume, customer support ticketing |
| 💬 **Customer Service** | `customerservice@poornasree.com` | `Service@1234` | `/customer-service` | General customer service and ticket handling |
| 💼 **Sales** | `sales@poornasree.com` | `Sales@1234` | `/sales` | Customer quotations, equipment inquiries, lead management |
| 📢 **Marketing** | `marketing@poornasree.com` | `Marketing@1234` | `/marketing` | WhatsApp promotional broadcast campaigns, audience segmentation |
| 👤 **Customer** | `customer@example.com` | `Customer@123` | `/dashboard` | Machine registry overview (Primary interaction is WhatsApp at `+91 94009 61291`) |

*Note: Engineer accounts also support one-time WhatsApp onboarding links for password setup via `/set-password`.*

---

## 📂 Project Structure

```
PoornasreeAI/
├── src/                          # Next.js 14 Web Application
│   ├── app/                      # Route groups by role: (admin), (super-admin), (service),
│   │                             # (service-manager), (assistant-manager), (dealer),
│   │                             # (sales), (marketing), (customer-support), (auth)
│   ├── components/               # Modular UI components (admin, service-manager, ui, providers)
│   └── lib/                      # Client utilities, api client, sockets, state stores
├── api/                          # Express 5 Backend API
│   ├── src/
│   │   ├── config/               # Validated env configurations
│   │   ├── controllers/          # 28 REST controllers for all system domains
│   │   ├── routes/               # Modular Express routes
│   │   ├── services/             # Core business logic: tickets, Groq LLM, WhatsApp, machine, RAG
│   │   ├── lib/                  # Prisma client, Socket.IO, permissions, OTP helpers
│   │   └── middleware/           # JWT authentication and authorization guard
│   ├── prisma/                   # PostgreSQL schema.prisma, migrations, and seed scripts
│   └── uploads/                  # Customer uploads, work report photos, campaign media
├── data/                         # Master training data, dealer directories, syllabus, reference
│   ├── training/                 # Intent JSONs, Excel sources, training archives
│   ├── reference/                # Machine channel specs & calibration notes
│   ├── dealers/                  # Pincode dealer directories
│   └── quotations/               # Equipment proposals and quotes
├── docs/                         # Comprehensive documentation hub
│   ├── INDEX.md                  # 🌟 Master documentation index & directory
│   ├── ARCHITECTURE.md           # 🌟 Master Architecture & Handover Blueprint
│   ├── user-guides/              # Individual role-based user guides (8 roles)
│   ├── technical/                # REST API catalog, LLM billing, n8n webhooks, HR sync
│   ├── deployment/               # Production VPS runbooks, SSH setup & bootstrap history
│   ├── reports/                  # Audit reports, LMS proposals, simulation plans
│   └── whatsapp/                 # WhatsApp conversation flowcharts & specs
├── ops/                          # VPS bootstrap, Nginx, SSL, and data management scripts
│   └── archive/                  # Historical seed scripts & legacy VPS implementations
├── scripts/                      # Quick deployment, dev tunnels & server guard utilities
│   ├── deploy/                   # Quick deployment scripts (deploy-quick.sh/.ps1)
│   ├── dev/                      # Local dev with remote API & tunnels
│   ├── maintenance/              # Chat log and data purges
│   └── server/                   # Host security watchdogs & PM2 daemons
├── tests/                        # Automated testing hub & simulation runbooks
├── docker-compose.yml            # Production container orchestration
├── Dockerfile                    # Multi-stage Next.js frontend build
└── deploy.sh                     # VPS automated deployment runner
```

---

## ⚡ Quick Start (Local Development)

### 1. Prerequisites
- Node.js 20+
- PostgreSQL 16
- Qdrant (Docker or binary)

### 2. Environment Setup
```bash
# Clone the repository
git clone <repo-url>
cd PoornasreeAI

# Copy environment templates
cp .env.example .env
cp api/.env.example api/.env
```

### 3. Database Initialization & Seeding
```bash
cd api
npm install
npx prisma migrate deploy
npx prisma db seed
cd ..
```

### 4. Start Development Servers
```bash
# From workspace root (runs both frontend on :3000 and backend on :4000)
npm install
npm run dev
```

Visit **http://localhost:3000** to log in.

---

## 📖 Key Documentation

- **[Master Documentation Index](docs/INDEX.md)**: Central directory mapping all system documentation and runbooks.
- **[Master Architecture & Handover Blueprint](docs/ARCHITECTURE.md)**: End-to-end topology, data models, state machines, and AI pipelines.
- **[User Guides Hub](docs/user-guides/README.md)**: Detailed step-by-step role guides with screenshots and walkthroughs.
- **[Production Deployment Runbook](docs/deployment/DEPLOY-RUNBOOK.md)**: VPS provisioning, Docker Compose, Nginx SSL setup, and PM2/guard scripts.
- **[WhatsApp Engine Specification](docs/whatsapp/current_whatsapp_architecture.md)**: Conversational FSM and Meta Cloud API integration.
- **[Backend API Reference](docs/technical/API.md)**: Endpoint catalog with authentication requirements.
- **[Operations & Dev Scripts Hub](scripts/README.md)**: Directory guide for deployment and dev tunneling scripts.
- **[Automated Test Suites Hub](tests/README.md)**: E2E customer simulation scenarios and test harnesses.
