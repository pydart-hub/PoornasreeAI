# PoornasreeAI Documentation Index

This directory contains technical architecture blueprints, operational runbooks, user manuals, and API specifications for **PoornasreeAI**.

---

## 🌟 Primary Documentation (Start Here)

| Document | Description | Target Audience |
|---|---|---|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | **Master Architectural Blueprint**: Full system topology, user journeys, conversational FSM, database schema, and operational playbook | Technical Leads, Architects, Developers |
| **[user-guides/README.md](user-guides/README.md)** | **User Guides Hub & Credentials**: Complete login credentials for all 11 user roles, portal routes, and permissions matrix | All Stakeholders, Client Ops |
| **[deployment/DEPLOY-RUNBOOK.md](deployment/DEPLOY-RUNBOOK.md)** | **Production VPS Deployment Runbook**: The single official deployment and maintenance guide for the Linux VPS | DevOps, SysAdmins |

---

## 👥 Role-Based User Manuals (`docs/user-guides/`)

| Document | Portal Route | Primary Role Covered |
|---|---|---|
| **[user-guides/README.md](user-guides/README.md)** | `/login` | Central Hub, Credentials Table, and Permissions Matrix |
| **[user-guides/ADMIN_GUIDE.md](user-guides/ADMIN_GUIDE.md)** | `/admin` | System Administrator (Users, Products, Videos, Templates) |
| **[user-guides/SUPER_ADMIN_GUIDE.md](user-guides/SUPER_ADMIN_GUIDE.md)** | `/super-admin` | Super Admin (LLM Keys, DB Overrides, Billing Telemetry) |
| **[user-guides/SERVICE_MANAGER_GUIDE.md](user-guides/SERVICE_MANAGER_GUIDE.md)** | `/service-manager` | Service Manager & Assistant Manager (Dispatch, SLA, Reassign) |
| **[user-guides/SERVICE_ENGINEER_GUIDE.md](user-guides/SERVICE_ENGINEER_GUIDE.md)** | `/service` | Field Engineers (Mobile view, OTP close, Work Reports) |
| **[user-guides/DEALER_GUIDE.md](user-guides/DEALER_GUIDE.md)** | `/dealer` | Authorized Dealers (Customer registration, Warranty claims) |
| **[user-guides/CUSTOMER_SUPPORT_GUIDE.md](user-guides/CUSTOMER_SUPPORT_GUIDE.md)** | `/support-dashboard` | Support & Service Agents (Live chat takeover, Ticket queue) |
| **[user-guides/CUSTOMER_GUIDE.md](user-guides/CUSTOMER_GUIDE.md)** | WhatsApp Bot | End Customers (Troubleshooting, Machine registration, Star rating) |

---

## ⚙️ Technical Specifications & API References (`docs/technical/`)

| Document | Description |
|---|---|
| **[technical/API.md](technical/API.md)** | Complete REST endpoint catalog with HTTP methods, parameters, and roles |
| **[technical/BILLING_AND_USAGE_API.md](technical/BILLING_AND_USAGE_API.md)** | LLM token usage tracking and Meta WhatsApp messaging cost telemetry |
| **[technical/TICKET_INTEGRATION.md](technical/TICKET_INTEGRATION.md)** | Webhook specifications and external n8n integration endpoints |
| **[technical/HR_ENGINEERS_SYNC.md](technical/HR_ENGINEERS_SYNC.md)** | Automated roster synchronization with external HR system (`hr_api_v2`) |
| **[technical/TROUBLESHOOTING_AI_ARCHITECTURE.md](technical/TROUBLESHOOTING_AI_ARCHITECTURE.md)** | In-depth RAG pipeline, vector chunking, and Groq classification logic |

---

## 🚀 Deployment & Infrastructure Runbooks (`docs/deployment/`)

| Document | Description |
|---|---|
| **[deployment/DEPLOY-RUNBOOK.md](deployment/DEPLOY-RUNBOOK.md)** | **Primary Deployment Runbook**: Production VPS Docker, Nginx, SSL & updates |
| **[deployment/STAFF-SSH-SETUP-WINDOWS.md](deployment/STAFF-SSH-SETUP-WINDOWS.md)** | Step-by-step SSH key and config setup for Windows staff |
| **[deployment/STAGE_01_INITIAL_SETUP.md](deployment/STAGE_01_INITIAL_SETUP.md)** | Historical server bootstrap and environment configuration |

---

## 📊 Planning, Audits & Test Reports (`docs/reports/`)

| Document | Description |
|---|---|
| **[reports/BUG_REPORT_2026-08-05.md](reports/BUG_REPORT_2026-08-05.md)** | Bug audit, security findings, and resolution verification |
| **[reports/LMS_PROPOSAL.md](reports/LMS_PROPOSAL.md)** | Learning Management System proposal & course curriculum |
| **[reports/SIMULATION_TEST_PLAN.md](reports/SIMULATION_TEST_PLAN.md)** | Conversational simulation and regression testing plan |
| **[reports/plan.md](reports/plan.md)** | Initial conversational architecture and WhatsApp design plan |

---

## 📱 WhatsApp Flowcharts & Deep Dives (`docs/whatsapp/`)

| File | Type | Description |
|---|---|---|
| **[whatsapp/current_whatsapp_architecture.md](whatsapp/current_whatsapp_architecture.md)** | Markdown | Core WhatsApp service architecture, state transitions, and webhook receiver |
| **[whatsapp/GROQ_WHATSAPP_AGENT.md](whatsapp/GROQ_WHATSAPP_AGENT.md)** | Markdown | Groq Llama 3.3 conversational agent configuration and prompting guidelines |
| **[whatsapp/WHATSAPP_FEATURES_ANALYSIS.md](whatsapp/WHATSAPP_FEATURES_ANALYSIS.md)** | Markdown | Comprehensive feature breakdown of all WhatsApp interactions |
| **[whatsapp/customer_chatbot_flowchart.html](whatsapp/customer_chatbot_flowchart.html)** | Interactive HTML | Visual customer interaction flowchart |
| **[whatsapp/all_whatsapp_features_flow.html](whatsapp/all_whatsapp_features_flow.html)** | Interactive HTML | Visual end-to-end multi-role WhatsApp flow |

---

## 🛠️ Operations & Development Scripts (`scripts/` & `ops/`)

- **[scripts/README.md](../scripts/README.md)**: Full index of deploy, dev, maintenance, and server watchdog scripts.
- **[ops/README.md](../ops/README.md)**: Index of database import utilities, user seeding, and server bootstrap scripts.
- **[tests/README.md](../tests/README.md)**: Guide to automated test suites and simulation scenarios.
