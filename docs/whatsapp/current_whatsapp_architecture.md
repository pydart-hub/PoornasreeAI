# Poornasree AI — Minimal WhatsApp Architecture & Baseline Technical Documentation

> **Last Updated**: August 12, 2026  
> **Status**: **Clean Minimal Baseline Ready — Awaiting User Command for New Development**  
> **Environment**: Production (`poornasree-v4` / Docker `poornasree-ai-api-1`)

---

## 1. Active Working File Registry

| Module Role | File Path | Primary Responsibilities |
|---|---|---|
| **Webhook Ingestion Controller** | [`api/src/controllers/whatsapp.controller.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/controllers/whatsapp.controller.ts) | Receives Meta Cloud API webhooks (`POST /api/whatsapp/webhook`), handles Meta verification challenge (`GET /api/whatsapp/webhook`), deduplicates message IDs, downloads WhatsApp voice notes/images, and routes text payloads. |
| **Core State Machine Engine (FSM)** | [`api/src/services/simulate.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/simulate.service.ts) | Manages state machine transitions (`GREETING`, `REGISTER_PROMPT`, `REGISTER_SERIAL`, `REGISTER_NAME`, `REGISTER_PINCODE`, `REGISTER_GMAP`, `MAIN_MENU`, `CHANGE_LANGUAGE`), customer registration, and language switcher. |
| **Base Meta API Client** | [`api/src/services/whatsapp.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/whatsapp.service.ts) | Sends text messages (`sendMessage`), interactive buttons (`sendInteractiveButtons`), interactive list menus (`sendInteractiveList`), media buffers, and typing indicator animations to Meta Cloud API. |
| **Groq AI Client & Speech-to-Text** | [`api/src/services/groq.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/groq.service.ts) | Transcribes WhatsApp voice notes (`.ogg`) using `whisper-large-v3-turbo` and executes Groq LLM completion requests (`llama-3.3-70b-versatile`). |
| **Webhook Routes** | [`api/src/routes/whatsapp.routes.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/routes/whatsapp.routes.ts) | Registers public HTTP endpoints for Meta webhook verification and inbound message ingestion. |
| **Simulated Chat API Routes** | [`api/src/routes/simulate.routes.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/routes/simulate.routes.ts) & [`api/src/controllers/simulate.controller.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/controllers/simulate.controller.ts) | Enables local and admin panel test chat simulation over HTTP (`POST /api/simulate/message`). |

---

## 2. Active WhatsApp Production Features

### 🟢 1. Smart Complaint Registration & AI Troubleshooting
- **Flow**:
  1. Customer selects **`Complaint Registration [2]`** from the main menu or types any machine breakdown query directly in chat (e.g. `"Vibro not working"`, `"T2 error"`, `"Rate chart issue"`).
  2. Bot uses `runGroqCompanyAssistant` / Gemini RAG pipeline grounded in `CHATBOT_DATAS` to generate precise, natural sentence-case troubleshooting steps with `[ ✅ Resolved ]` and `[ ❌ Unresolved ]` buttons.
  3. If user taps `[ ❌ Unresolved ]`:
     - Discovers registered customer details and machine fleet.
     - Directs to the ticket confirmation summary card.

---

### 🟢 2. Multi-Machine Selection & Dynamic "Change Machine"
- **Multi-Machine Discovery**:
  - Automatically queries all previous tickets under the customer's phone number (`getCustomerRegisteredMachines`).
  - If multiple machines exist, displays an interactive list (`SELECT_REGISTERED_MACHINE`):
    - `🔘 1. Machine Model A (Serial X)`
    - `🔘 2. Machine Model B (Serial Y)`
    - `🔘 ➕ Enter Different Serial`
- **Dynamic Change Machine Action**:
  - Summary card includes `[ 🔄 Change Machine ]`.
  - When typed or selected, allows entering a new serial number.
  - Automatically validates against Passtest API (`fetchMachineBySerial`) and upserts into `prisma.machine`.

---

### 🟢 3. Automatic Customer Registration & Profile Recognition
- **Returning Customers (`startGreeting`)**:
  - Greeted immediately by name (e.g. *"Welcome back, Sombi! 👋"*) without showing redundant registration forms.
  - Direct access to the Main Menu interactive list.
- **New Customers (`getOrCreateCustomerUser`)**:
  - Automatically registers a `User` account (`role = "customer"`, `whatsappNumber`) during complaint booking.
  - Direct ticket attribution to `ticket.customerId`.

---

### 🟢 4. Meta WhatsApp 1024-Character Auto-Overflow Engine
- Resolves Meta's strict 1024-character limit on interactive messages.
- If troubleshooting text > 1000 characters:
  1. Delivers complete text guide as a standard text message (up to 4096 characters).
  2. Immediately delivers interactive action buttons (`[ ✅ Resolved ]`, `[ ❌ Unresolved ]`).

---

### 🟢 5. Multi-Language Session Switching & Persistence
- **Supported Languages**: English (`en`), Hindi (`hi`), Malayalam (`ml`), Tamil (`ta`), Kannada (`kn`), Telugu (`te`), Marathi (`mr`), Bengali (`bn`).
- Dynamic translation across state prompts, action buttons, and ticket confirmation summaries.

---

### 🟢 6. Voice Note Audio Transcription (Groq Whisper)
- Automatically transcribes `.ogg` voice notes in real-time (`whisper-large-v3-turbo`) across Indian languages and executes troubleshooting.

---

### 🟢 7. Human Support Agent Handoff (Live Chat Takeover)
- Sets `isBotPaused = true` and broadcasts Socket.IO events to `/admin?tab=livechat` for real-time staff takeover.

---

## 3. Current Operational Status
- **Build Status**: Compiling with 0 errors (`tsc --noEmit` clean).
- **Stack Connectivity**: Active Cloudflare / ngrok webhook tunnel, persistent PostgreSQL tunnel on port `5433`, live Meta Graph API integration.
