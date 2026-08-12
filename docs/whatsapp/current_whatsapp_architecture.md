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

## 2. Active Baseline WhatsApp Features

### 🟢 1. Machine Registration Flow (FSM Engine)
- **Trigger**: Customer sends greeting (`Hi`, `Namaste`, `Menu`) or taps `[📝 Register Machine]`.
- **Flow**:
  1. `REGISTER_PROMPT`: Welcomes customer and presents interactive choices: `[📝 Register Machine]`, `[⏭️ Skip for Now]`, `[🌐 Select Language]`.
  2. `REGISTER_SERIAL`: Asks for 10-digit Machine Serial Number (e.g., `ECO-2024-8841`).
  3. `REGISTER_NAME`: Captures Customer Full Name.
  4. `REGISTER_PINCODE`: Captures 6-digit Pincode.
  5. `REGISTER_GMAP`: Captures Location / Google Maps Link / Address.
- **Database Action**: Creates a new customer account in the `User` table (`role = "customer"`) and links the machine serial entity.

---

### 🟢 2. Multi-Language Session Switching & Persistence
- **Supported Languages**: English (`en`), Hindi (`hi`), Malayalam (`ml`), Tamil (`ta`), Kannada (`kn`), Telugu (`te`), Marathi (`mr`), Bengali (`bn`).
- **Trigger**: User types a language name (e.g., `"Malayalam"`, `"Hindi me bolo"`) or taps `[🌐 Select Language]`.
- **System Action**:
  - Updates `ConversationSession.metadata` in PostgreSQL with `meta.language = "ml"`.
  - Sets `explicitLanguage = true`.
  - Dynamic translation of state prompts and button titles into the selected language.

---

### 🟢 3. Groq Speech-to-Text & Flagship LLM Integration
- **Voice Note Audio Transcription (Active Live)**:
  - **Location**: [`api/src/services/groq.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/groq.service.ts) ➔ `transcribeAudioWithGroq()`
  - **Model**: `whisper-large-v3-turbo`
  - **Function**: Automatically transcribes WhatsApp `.ogg` voice notes into text (supporting Malayalam, Hindi, Tamil, Telugu, English, etc.) and routes transcribed text into the session handler.
- **LLM Engine**: Configured to Meta's flagship **`llama-3.3-70b-versatile`** across all runtime settings.

---

### 🟢 4. Human Support Agent Handoff (Live Chat Takeover)
- **Trigger**: Customer taps `[💬 Talk to us]` or `[💬 Talk to Support]`.
- **System Action**: Sets `isBotPaused = true` and broadcasts real-time Socket.IO events to `/admin?tab=livechat` for human support takeover.

---

### 🟢 5. Customer Image Upload Handling
- **Location**: [`api/src/controllers/whatsapp.controller.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/controllers/whatsapp.controller.ts) ➔ `handleCustomerImage()`
- **Flow**: Downloads image binary from Meta Graph API, saves file to `/uploads/customer-uploads/`, and broadcasts attachment link to Admin Live Chat dashboard.

---

## 3. Purged Legacy Modules
- **Secondary Agents**: Deleted `whatsapp-agent.service.ts`, `dealer-whatsapp.service.ts`, `engineer-whatsapp.service.ts`, `engineer-ticket-notification.service.ts`, `dealer-ticket-notification.service.ts`, `session-cleanup.service.ts`, `customer-clear.service.ts`.
- **Troubleshoot FSM**: Purged `TROUBLESHOOT_STEP`, `TROUBLESHOOT_DONE_OPTIONS`, `ASK_VIDEO_TUTORIAL`, `VIDEO_HELPED`, `ASK_BOOK_SERVICE`, `COMPLAINT_PRODUCT`, `COMPLAINT_SUBCATEGORY`, `COMPLAINT_DESCRIBE` from `simulate.service.ts`.
- **Legacy Classifiers**: Purged `complaint-classifier.service.ts` and `engineer-training-video.service.ts`.

---

## 4. Current Operational Status
- **Baseline**: Clean, minimal, high-performance codebase compiling with 0 errors.
- **Next Development Step**: **Standing by for user instructions before building new features.**
