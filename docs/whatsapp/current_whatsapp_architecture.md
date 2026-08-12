# Poornasree AI — Current Active WhatsApp Architecture & Technical Documentation

> **Last Updated**: August 12, 2026  
> **Environment**: Production (`poornasree-v4` / Docker `poornasree-ai-api-1`)

---

## 1. Active Working File Registry

| Module Role | File Path | Primary Responsibilities |
|---|---|---|
| **Webhook Ingestion Controller** | [`api/src/controllers/whatsapp.controller.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/controllers/whatsapp.controller.ts) | Receives Meta Cloud API webhooks (`POST /api/whatsapp/webhook`), handles Meta verification challenge (`GET /api/whatsapp/webhook`), deduplicates message IDs, downloads WhatsApp voice notes/images, and routes text payloads. |
| **Core State Machine Engine (FSM)** | [`api/src/services/simulate.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/simulate.service.ts) | Manages state machine transitions (`GREETING`, `REGISTER_SERIAL`, `REGISTER_NAME`, `REGISTER_PINCODE`, `REGISTER_GMAP`, `MAIN_MENU`), customer registration, and language switcher. |
| **Base Meta API Client** | [`api/src/services/whatsapp.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/whatsapp.service.ts) | Sends text messages (`sendMessage`), interactive buttons (`sendInteractiveButtons`), interactive list menus (`sendInteractiveList`), media buffers, and typing indicator animations to Meta Cloud API. |
| **Webhook Routes** | [`api/src/routes/whatsapp.routes.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/routes/whatsapp.routes.ts) | Registers public HTTP endpoints for Meta webhook verification and inbound message ingestion. |
| **Simulated Chat API Routes** | [`api/src/routes/simulate.routes.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/routes/simulate.routes.ts) & [`api/src/controllers/simulate.controller.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/controllers/simulate.controller.ts) | Enables local and admin panel test chat simulation over HTTP (`POST /api/simulate/message`). |
| **Groq AI Client & Speech-to-Text** | [`api/src/services/groq.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/groq.service.ts) | Transcribes WhatsApp voice notes (`.ogg`) using `whisper-large-v3-turbo` and executes Groq LLM completion requests. |
| **Semantic Complaint Classifier** | [`api/src/services/complaint-classifier.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/complaint-classifier.service.ts) | Hybrid classifier engine using `llama-3.3-70b-versatile` to match customer complaint text against `DocumentIssue` database candidates. |
| **Training Catalog & Issue Loader** | [`api/src/services/training-catalog.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/training-catalog.service.ts) | Loads 200+ `DocumentIssue` entries (`CHATBOT_DATAS`) from PostgreSQL for issue prefiltering. |

---

## 2. Active Working WhatsApp Features

### 🟢 1. Machine Registration Flow (FSM Engine)
- **Trigger**: New customer sends greeting (`Hi`, `Namaste`, `Menu`) or taps `[📝 Register Machine]`.
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
  - All subsequent state prompts, greeting menus, troubleshooting steps, and button titles dynamically translate into the selected language.

---

### 🟢 3. Groq AI Integration (LLM & Speech-to-Text)

#### A. Voice Note Audio Transcription (Active Live)
- **Location**: [`api/src/services/groq.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/groq.service.ts) ➔ `transcribeAudioWithGroq()`
- **Endpoint**: `https://api.groq.com/openai/v1/audio/transcriptions`
- **Model**: `whisper-large-v3-turbo`
- **Function**: When a customer sends a WhatsApp voice note (`.ogg`), the audio binary buffer is fetched via Meta Graph API and sent to Groq Whisper. The resulting transcript (in Malayalam, Hindi, Tamil, English, etc.) is processed seamlessly as user text.

#### B. Groq 70B Semantic Complaint Classification Engine
- **Location**: [`api/src/services/complaint-classifier.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/complaint-classifier.service.ts) ➔ `classifyComplaintWithGroq()`
- **Endpoint**: `https://api.groq.com/openai/v1/chat/completions`
- **Model**: `llama-3.3-70b-versatile`
- **Parameters**: `temperature = 0.1`, `max_tokens = 250`, `response_format = { type: "json_object" }`.
- **Function**: Prefilters top 15 candidate issues from 200+ `DocumentIssue` entries using short-word aliases (`T2`, `Vibro`, `Power`, `Sensor`). Sends candidate JSON array to Groq 70B to evaluate confidence score (requires `score >= 75`).

---

### 🟢 4. Service Complaint Ticket Booking
- **Trigger**: Customer taps `[🛠️ Book Service]` or `[🛠️ Register Complaint]`.
- **Flow**:
  1. `COMPLAINT_ASK_SERIAL`: Asks for Machine Serial Number (or allows Skip).
  2. `COMPLAINT_ASK_ISSUE`: Captures specific fault description.
- **Database Action**: Writes a new `Ticket` entity in PostgreSQL (`ticketNumber = "SRV-2026-0812-004"`), links customer phone number, and sends confirmation with Ticket ID.

---

### 🟢 5. Human Support Agent Handoff (Live Chat Takeover)
- **Trigger**: Customer taps `[💬 Talk to us]` or `[💬 Talk to Support]`.
- **System Action**:
  - Updates session state to `isBotPaused = true`.
  - Emits real-time Socket.IO event `support-chat:message` to the Admin Control Panel (`/admin?tab=livechat`).
  - Automated bot replies are paused while human support agent chats directly with customer via WhatsApp.

---

### 🟢 6. Interactive WhatsApp Buttons & List Menus
- **Location**: [`api/src/services/whatsapp.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/whatsapp.service.ts)
- **Payload Types**:
  - `sendInteractiveButtons`: Sends quick-reply button arrays (up to 3 buttons).
  - `sendInteractiveList`: Sends structured list rows with titles and descriptions.
- **Fallback**: If Meta API returns an error for interactive payloads, automatically falls back to plain-text formatted menus.

---

### 🟢 7. Customer Image Upload Handling
- **Location**: [`api/src/controllers/whatsapp.controller.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/controllers/whatsapp.controller.ts) ➔ `handleCustomerImage()`
- **Flow**: Downloads image binary from Meta Graph API, saves file to `/uploads/customer-uploads/`, logs message entry in `SimulateMessage`, and broadcasts attachment link to Admin Live Chat dashboard.

---

## 3. Core Database Entities Involved

```
[Customer WhatsApp Message]
          │
          ▼
┌───────────────────────────┐
│   ConversationSession     │ ── Stores state (REGISTER_SERIAL, MAIN_MENU) & language metadata
└───────────────────────────┘
          │
          ├──────────────────────────┐
          ▼                          ▼
┌───────────────────┐      ┌──────────────────┐
│   SimulateMessage │      │       User       │ ── Stores customer profile & machine registration
└───────────────────┘      └──────────────────┘
                                     │
                                     ▼
                           ┌──────────────────┐
                           │      Ticket      │ ── Service complaint tickets
                           └──────────────────┘
```

---

## 4. Summary of Live Executable Code Locations

1. **Meta Webhook Endpoint**: `POST /api/whatsapp/webhook` ➔ `whatsapp.controller.ts:handleWebhook`
2. **Customer FSM State Router**: `simulate.service.ts:handleMessage`
3. **Voice Note Whisper API**: `groq.service.ts:transcribeAudioWithGroq`
4. **Groq 70B LLM Classifier**: `complaint-classifier.service.ts:classifyComplaintWithGroq`
