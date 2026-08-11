# WhatsApp Chat Features — Complete Technical Analysis

> **Scope:** Customer-facing WhatsApp chatbot, AI agent, complaint registration, troubleshooting, service booking, registration flow, engineer WhatsApp, dealer WhatsApp.
> **Date:** 2026-08-11
> **Key files:**
> - `api/src/controllers/whatsapp.controller.ts` — webhook entry, message routing
> - `api/src/services/simulate.service.ts` — FSM (Finite State Machine) for customer conversations
> - `api/src/services/whatsapp-agent.service.ts` — Groq LLM conversational AI agent
> - `api/src/services/whatsapp.service.ts` — Meta Cloud API message sender (buttons, lists, images, video)
> - `api/src/services/chatbotSettings.service.ts` — bot name, support phone
> - `api/src/services/engineer-whatsapp.service.ts` — engineer WhatsApp routing
> - `api/src/services/dealer-whatsapp.service.ts` — dealer WhatsApp routing
> - `api/src/routes/whatsapp.routes.ts` — route mount at `/api/whatsapp`

---

## 1. Architecture Overview

```
Meta WhatsApp Cloud API
        │
        ▼
GET/POST /api/whatsapp/webhook   ← whatsapp.routes.ts
        │
        ▼
whatsapp.controller.ts ─ handleWebhook() ─→ processWebhook() ─→ handleSingleMessage()
        │
        ├─── msg.type === "location"     → FSM / engineer / dealer routing
        ├─── msg.type === "image"         → engineer or customer image handler
        ├─── msg.type === "audio/voice"   → Groq STT → text → routing
        └─── msg.type === "text/interactive" (button_reply / list_reply)
                  │
                  ├─── text extracted from button_reply.id  (e.g. "register", "2", "MENU")
                  ├─── text extracted from list_reply.id    (e.g. "1", "COMPLAINT_42")
                  └─── plain text from msg.text.body
                            │
                            ├─── Engineer? ──→ routeEngineerMessage()
                            ├─── Dealer?   ──→ handleDealerWhatsAppMessage()
                            └─── Customer? ──→ SimulateService.handleMessage()
                                      │
                                      ├── isGroqChatbotEnabled() && !inLegacyTransactional
                                      │     └──→ whatsapp-agent.service.ts (Groq AI)
                                      │
                                      └── FSM ── routeState() ── handle*() per state
```

### 1.1 Dual-Mode: FSM + Groq AI Agent

The customer conversation has **two modes** controlled by `runtime.chatbotMode()`:

1. **FSM Mode** (`chatbotMode !== "groq"`): Everything goes through the `SimulateService` FSM.
2. **Groq Agent Mode** (`chatbotMode === "groq"` and `isGroqChatbotEnabled()` returns true): Most messages go to the Groq LLM agent. Certain "legacy transactional" states force FSM routing.

The `isGroqChatbotEnabled()` check in `simulate.service.ts:handleMessage()`:
```typescript
if (isGroqChatbotEnabled() && !inFeedback && !inLegacyTransactional) {
  try {
    const agentReply = await handleCustomerAgentMessage(phoneNumber, text);
    if (agentReply) return agentReply;        // agent handled it
    // null → agent wants FSM handoff (e.g. BOOK_SERVICE → serial prompt)
  } catch {
    // fall through to FSM
  }
}
```

---

## 2. Entry Point — Webhook & Message Extraction

### 2.1 Webhook Verification (`GET /api/whatsapp/webhook`)

Meta calls this when setting up the webhook. It validates `hub.mode=subscribe` and `hub.verify_token` match the runtime config. Returns the `hub.challenge` string on success.

### 2.2 Inbound Message Processing (`POST /api/whatsapp/webhook`)

The handler:
1. Immediately returns HTTP 200 to Meta (async processing).
2. Parses the webhook body for `whatsapp_business_account` entries.
3. Iterates through all messages.
4. Calls `handleSingleMessage(msg)` per message.

### 2.3 Message Type Dispatch

The controller handles these incoming WhatsApp message types:

| Type | Handling |
|------|----------|
| `text` | Extracts `msg.text.body` → text |
| `audio` / `voice` | Downloads media via `WhatsAppService.downloadMediaBuffer()`, transcribes with Groq STT (`transcribeAudioWithGroq`) |
| `interactive` → `button_reply` | Extracts `interactive.button_reply.id` (e.g. `"register"`, `"MENU"`, `"SKIP"`, `"1"`) |
| `interactive` → `list_reply` | Extracts `interactive.list_reply.id` (e.g. `"2"`, `"COMPLAINT_abc123"`) |
| `location` | Converts lat/lng to Google Maps URL, routes based on user role |
| `image` | Routes to engineer image handler or customer image handler |

### 2.4 Role-Based Routing (Before Customer FSM)

Before reaching the customer FSM, the controller checks:
1. **Service Engineer** — matches `user.role === "service_engineer"` by phone suffix
2. **Dealer** — matches `user.role === "dealer"` by phone suffix
3. **Customer** — everything else → FSM

### 2.5 Deduplication

A `processedIds` Set with 5-minute TTL prevents double-processing from Meta retries.

---

## 3. FSM (Finite State Machine) — Customer Chat

### 3.1 State Diagram

```
                          ┌──────────┐
                          │ GREETING │
                          └────┬─────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
             registered?              new user
                    │                     │
                    ▼                     ▼
           ┌──────────────┐     ┌───────────────┐
           │  MAIN_MENU   │     │ REGISTER_PROMPT│
           └──────┬───────┘     └───────┬───────┘
                  │                      │
     ┌────────────┼────────────┐        │
     │            │            │     REGISTER │ SKIP
   [1]          [2]          [3]        │      │
     │            │            │        ▼      ▼
 VIEW_   COMPLAINT_   COMPLAINT   REGISTER_SERIAL  MAIN_MENU
 PRODUCTS ASK_SERIAL  STATUS    ┌─────────────────────────────┐
     │       │        │         │ Serial → look up Passtest    │
     │       ▼        │         │ → found → MACHINE_CONFIRM   │
     │  MACHINE_CONFIRM│       │ → not found → ask again      │
     │       │        │         │ → SKIP → skip serial         │
     │    YES/NO      │         └─────────────┬───────────────┘
     │       │        │                       │
     │       ▼        │                 REGISTER_NAME (Step 2)
     │  COMPLAINT_    │                       │
     │  CATEGORY      │                       ▼
     │  ─────────     │               REGISTER_PINCODE (Step 3)
     │  PRODUCT        │                       │
     │  SUBCATEGORY    │                       ▼
     │  DESCRIBE       │               REGISTER_GMAP (Step 4)
     │       │         │                       │
     │       ▼         │                 save User → MAIN_MENU
     │  TROUBLESHOOT   │
     │  STEP           │
     │       │         │
     │    YES ──────► ANOTHER_COMPLAINT_PROMPT
     │    NO  ──────► ASK_BOOK_SERVICE ──► create Ticket
     │    NEXT ─────► next step
     │    ALL DONE ─► ASK_VIDEO_TUTORIAL
     │       │              │
     │       ▼              ▼
     │  ASK_VIDEO  ◄──── YES (show video)
     │  TUTORIAL
     │       │
     │    YES ─────► VIDEO_HELPED → resolved? → ANOTHER_COMPLAINT_PROMPT
     │    NO  ─────► BOOK_SERVICE → create Ticket
     │       │
     │       ▼
     │  VIDEO_HELPED
     │       │
     │    YES ─────► ANOTHER_COMPLAINT_PROMPT
     │    NO  ─────► BOOK_SERVICE → create Ticket

MAIN_MENU: [4] Speak to Support → notify support team via WhatsApp
MAIN_MENU: [5] Change Language → language list → MAIN_MENU
```

### 3.2 All FSM States (from `simulate.service.ts`)

| State | Purpose |
|-------|---------|
| `GREETING` | First contact — checks registration, routes to MAIN_MENU or REGISTER_PROMPT |
| `ASK_PHONE` | Legacy phone verification (10-digit lookup against tickets) |
| `MAIN_MENU` | 5-option interactive list |
| `VIEW_PRODUCTS` | Show product catalog with images |
| `COMPLAINT_ASK_SERIAL` | Ask for machine serial number (Passtest lookup) |
| `MACHINE_CONFIRM` | Confirm machine found in Passtest database |
| `COMPLAINT_CATEGORY` | Select product category (if category flow active) |
| `COMPLAINT_PRODUCT` | Select specific product from category |
| `COMPLAINT_SUBCATEGORY` | Select sub-category (for analyzer products: Power/Data/Scale) |
| `COMPLAINT_DESCRIBE` | Describe complaint or select from template list |
| `TROUBLESHOOT_STEP` | Step-by-step troubleshooting navigation |
| `TROUBLESHOOT_DONE_OPTIONS` | After all steps — resolved / not resolved |
| `ASK_VIDEO_TUTORIAL` | Offer video tutorial before booking service |
| `VIDEO_HELPED` | Ask if video resolved the issue |
| `ANOTHER_COMPLAINT_PROMPT` | After ticket created — register another complaint? |
| `ASK_BOOK_SERVICE` | Prompt to book a service visit |
| `COMPLAINT_MANUAL_NAME` | Manual service booking — collect customer name |
| `COMPLAINT_MANUAL_PINCODE` | Collect 6-digit pincode for service address |
| `COMPLAINT_MANUAL_PINCODE_CONFIRM` | Confirm pincode/location |
| `END_CUSTOMER_ADDRESS` | Collect full address |
| `PASSTEST_CUSTOMER_NAME` | Passtest path — collect end customer name |
| `PASSTEST_PINCODE` | Passtest path — collect pincode |
| `PASSTEST_PINCODE_CONFIRM` | Confirm pincode for Passtest machine |
| `CHECK_STATUS` | Show recent tickets |
| `CHANGE_LANGUAGE` | Language selection list |
| `REGISTER_PROMPT` | Offer registration to new users |
| `REGISTER_SERIAL` | Collect machine serial number |
| `REGISTER_NAME` | Collect full name |
| `REGISTER_PINCODE` | Collect 6-digit pincode |
| `REGISTER_GMAP` | Collect Google Maps location link |
| `FEEDBACK_RATING` | Post-service 1-5 star rating |
| `FEEDBACK_SATISFIED` | Yes/No satisfaction check |
| `AGENT_CHAT` | Used by Groq agent mode (not FSM-native) |
| `COMPLETED` | Terminal state — session ended |

### 3.3 Main Menu Options

Sent as an **interactive list** (`sendInteractiveList`) with 5 rows:

| ID | Option | Next State |
|----|--------|-----------|
| `1` | View Our Products | `VIEW_PRODUCTS` → back to MAIN_MENU |
| `2` | Complaint Registration | `COMPLAINT_ASK_SERIAL` |
| `3` | Complaint Status | `CHECK_STATUS` → back to MAIN_MENU |
| `4` | Speak to Support | `COMPLETED` + notify support team |
| `5` | Change Language | `CHANGE_LANGUAGE` |

### 3.4 Global Commands (Any State)

| Input | Action |
|-------|--------|
| `MENU`, `START`, `RESET`, `HI`, `HELLO` | Returns to MAIN_MENU (via Groq agent if enabled, or FSM) |
| `BYE`, `CLOSE` | Sets state to `COMPLETED`, sends closing message |
| `GO_BACK`, `BACK`, `PREVIOUS`, `00` | Context-aware: returns to previous step in complaint flow |

### 3.5 Complaint Registration Flow (Detailed)

```
User: [2] Complaint Registration
  └─► COMPLAINT_ASK_SERIAL
        ├─► Serial entered → Passtest API lookup
        │     ├─► Found → MACHINE_CONFIRM (show customer/model/address)
        │     │     ├─► YES → COMPLAINT_SUBCATEGORY (analyzer) or COMPLAINT_DESCRIBE
        │     │     └─► NO  → showProductSelection (catalog-based)
        │     └─► Not found → "not found" message, re-ask
        └─► SKIP → showProductSelection

showProductSelection:
  ├─► Products have categories → COMPLAINT_CATEGORY (list)
  │     └─► Category selected → COMPLAINT_PRODUCT (list)
  │           └─► Product selected → COMPLAINT_DESCRIBE
  └─► No categories → COMPLAINT_DESCRIBE directly

COMPLAINT_DESCRIBE:
  ├─► User selects from complaint list (COMPLAINT_xxx id)
  │     └─► Template matched → show troubleshooting steps
  └─► User types complaint text
        ├─► Semantic vector search → findDocumentIssue()
        ├─► Text search → findDocumentIssue()
        └─► No match → "no steps found"

Troubleshooting (if template found):
  └─► Show Step 1 of N
        ├─► YES (resolved) → ANOTHER_COMPLAINT_PROMPT
        ├─► NEXT (more steps) → show Step N+1
        └─► ALL DONE → ASK_VIDEO_TUTORIAL or ASK_BOOK_SERVICE

ASK_VIDEO_TUTORIAL:
  ├─► YES → send video links → VIDEO_HELPED
  └─► NO  → ASK_BOOK_SERVICE

ASK_BOOK_SERVICE:
  ├─► BOOK_SERVICE → create service ticket
  └─► MENU → back to greeting
```

### 3.6 Ticket Creation — Two Paths

**Passtest Path** (machine serial was found in database):
```
beginPasstestTicketBooking()
  ├─► Pre-populate name/address from Passtest machine data
  ├─► Extract pincode from machine address if present
  ├─► If name+pincode known → PASSTEST_PINCODE_CONFIRM
  ├─► If only name known → PASSTEST_PINCODE (ask pincode)
  ├─► If only pincode known → PASSTEST_CUSTOMER_NAME (ask name)
  └─► If neither → PASSTEST_CUSTOMER_NAME (ask name first)
        ↓
  executePasstestTicketCreation()
    ├─► Create pincode record (upsert)
    ├─► Create ticket with machineSerialNumber, pincode, address
    ├─► Auto-assign engineer by pincode
    └─► Send TICKET_CONFIRMED message
```

**Manual Path** (no serial / skipped):
```
COMPLAINT_MANUAL_NAME → COMPLAINT_MANUAL_PINCODE → COMPLAINT_MANUAL_PINCODE_CONFIRM
  → END_CUSTOMER_ADDRESS → createTicketManual()
```

Both paths end at `ANOTHER_COMPLAINT_PROMPT` after ticket creation.

### 3.7 Registration Flow (New Customers)

```
New user sends first message
  └─► GREETING → not found in User table → REGISTER_PROMPT
        ├─► REGISTER button → REGISTER_SERIAL (Step 1)
        │     ├─► Serial entered → Passtest lookup
        │     │     ├─► Found → show machine details → CONTINUE button
        │     │     └─► Not found → CONTINUE button anyway
        │     └─► SKIP → skip serial
        │           ↓
        │     REGISTER_NAME (Step 2)
        │           ↓
        │     REGISTER_PINCODE (Step 3) → 6-digit pincode → geocoding
        │           ↓
        │     REGISTER_GMAP (Step 4) → Google Maps link
        │           ↓
        │     saveRegisteredCustomer()
        │       ├─► Create User record (role: "customer")
        │       └─► Update session state to MAIN_MENU
        │
        └─► SKIP → MAIN_MENU (no registration)
```

Registration saves the customer to the `User` table with `role: "customer"`, creating a `User` record with email `cust_{phone}@poornasree.ai` and a placeholder password hash.

### 3.8 Troubleshooting Step Display

When a complaint template matches:
1. Template steps are extracted and filtered (removes fallback steps like "contact Poornasree")
2. Steps are formatted as numbered bullet points with separators
3. Steps are **translated** via `translateText()` to the user's language
4. Sent with buttons: "Yes, Resolved", "Not Resolved", "Go Back"

Each subsequent step is shown individually with navigation buttons.

### 3.9 Video Recommendations

After every complaint description, the system searches for relevant videos:
- `findVideosForQuery(query)` searches the video catalog
- If no troubleshooting steps found AND videos exist → ask "Would you like to watch a tutorial video?"
- If steps found but user says "Not Resolved" → offer video before booking service
- Videos are sent as plain text messages with YouTube links after the interactive reply

### 3.10 Complaint Template Matching (`findDocumentIssue`)

Three-stage search:
1. **Vector semantic search** — embeds the complaint text, searches pgvector, matches if score ≥ 0.5
2. **Text search** — exact phrase match, then individual significant words (≥3 chars), against `documentIssue.title`, `.description`, `.problemType`
3. **Product name fallback** — matches by product name in title/problemType

Results are filtered by `audience: ["customer", "both"]` — engineer-only templates are excluded from customer flow.

### 3.11 Language Support

The FSM supports **7 languages**: English, Hindi, Tamil, Kannada, Marathi, Telugu, Bengali.

Every user-facing message has translations in all 7 languages via the `TRANSLATIONS` lookup table. The `t(key, lang, vars)` function:
1. Looks up the translation for the key + language
2. Falls back to English if translation missing
3. Replaces `{variable}` placeholders

Language selection is via interactive list in `CHANGE_LANGUAGE` state. The chosen language is persisted in `session.metadata.language`.

### 3.12 Smart Complaint List Building

For **Analyzer products** (LactoSure, LactoGrand, Eco-V), the system uses a 3-tier subcategory system:
- `SUBCAT_POWER` — "Power, Sensor & Display" → not turning on, battery, temp errors
- `SUBCAT_DATA` — "Data, Network & Print" → WiFi, printer, SMS, cloud
- `SUBCAT_SCALE` — "Scale & Reading" → reading variation, weighing scale

For other products, complaint lists are filtered by matching words against `problemType` tags.

### 3.13 Session Management

Sessions stored in `conversationSession` table:
- `id` — primary key
- `phoneNumber` — normalized to 10 digits
- `state` — current FSM state
- `metadata` — JSON blob with customer data, language, complaint data, registration data
- `isBotPaused` — when true, bot stops responding (human agent is chatting)
- `supportAgentId` — assigned support agent

`getOrCreateSession()` finds the best existing session (prefers non-COMPLETED, richest metadata), normalizes phone numbers, and deduplicates.

---

## 4. Groq AI Agent Mode

### 4.1 Activation

The agent is active when:
1. `isGroqConfigured()` — Groq API key is set
2. `runtime.chatbotMode() === "groq"` — feature flag enabled

When active, most messages bypass the FSM and go to the Groq LLM.

### 4.2 Agent Welcome Menu

When the agent starts (or MENU/HI/HELLO/START/RESTART in AGENT_CHAT state), it shows 3 interactive buttons:

```
┌──────────────────────────────────────────────┐
│ Namaste! 🙏 I'm [botName] from Poornasree   │
│ Equipments. How can I help you today?       │
│                                              │
│ [📝 Register Machine]                        │
│ [🔧 Troubleshoot]                            │
│ [🛠️ Book Service]                            │
└──────────────────────────────────────────────┘
```

### 4.3 Agent Conversation Flow

```
Customer types anything
  ├─► Language detection (script-based: Devanagari→hi, Tamil→ta, etc.)
  │     Also detects Hinglish, Tanglish, Manglish via keyword lists
  │
  ├─► Language persistence in session metadata
  │
  ├─► Context enrichment:
  │     ├─► Fetch machine data from Passtest API
  │     ├─► Fetch active tickets
  │     └─► Build machine summary + ticket summary
  │
  ├─► RAG Catalog loading:
  │     └─► Role-based catalog (customer / service_engineer / new_user)
  │
  ├─► Complaint classification:
  │     └─► Groq LLM classifies text against pre-filtered catalog entries
  │
  └─► Groq LLM completion (aiReply):
        ├─► System prompt includes: persona, company info, policies,
        │   customer memory, ticket memory, training documents,
        │   troubleshooting instructions
        └─► User prompt: conversation history + customer message
```

### 4.4 Agent Shortcuts

| Button ID | Text | Action |
|-----------|------|--------|
| `register` | Register Machine | Returns `null` → FSM handoff to REGISTER_SERIAL |
| `troubleshoot` | Troubleshoot | Shows "describe your issue" prompt |
| `book_service` | Book Service | Sets state to `COMPLAINT_ASK_SERIAL` → FSM handoff |
| `SKIP` | Skip | Valid only in `COMPLAINT_ASK_SERIAL` → FSM handoff |
| `TALK_AGENT` / `SPEAK TO SUPPORT` | Talk to us | Triggers live support notification |
| `YES_RESOLVED` | Resolved | Shows success message, resets complaint state |
| `MENU` | Menu | Shows agent welcome menu |

### 4.5 Agent → FSM Handoff Points

The agent returns `null` to signal FSM should take over:
1. **BOOK_SERVICE** — sets session state to `COMPLAINT_ASK_SERIAL`, FSM handles serial → complaint → ticket creation
2. **REGISTER** — FSM handles full registration flow
3. **SKIP** in COMPLAINT_ASK_SERIAL — FSM skips serial and goes to product selection

When FSM takes over, `handleMessage()` refreshes the session and routes to the appropriate FSM state handler.

### 4.6 Complaint Booking in Agent Mode

When user taps "Book Service":
1. Agent sets session state to `COMPLAINT_ASK_SERIAL`
2. Returns `null`
3. FSM picks up in `COMPLAINT_ASK_SERIAL` state
4. Shows serial prompt → user enters serial → Passtest lookup → complaint flow → ticket creation
5. After ticket created, agent session resets back to `AGENT_CHAT`

### 4.7 Engineer Detection

The agent detects if the sender is a service engineer by:
1. Checking `isRegisteredEngineer()` — matches phone against `user.role === "service_engineer"`
2. Detecting technical keywords: `circuit`, `pcb`, `soldering`, `transducer`, `wiring`, `pin voltage`, `board replace`

If either matches, the agent switches to **engineer mode** — providing PCB-level troubleshooting, component replacement steps, calibration details, and wiring schematics.

### 4.8 Live Support Notification

When customer taps "Speak to Support" (Talk to Agent):
1. Agent sends a WhatsApp template message to the support team's phone
2. Template: `engineer_ticket_assigned` with "Live Chat Request" details
3. Template parameters: Support Team, Live Chat Request, customer name, customer phone, WhatsApp Chatbot, message
4. Support team sees notification → logs into dashboard → pauses chatbot for that user → chats manually

### 4.9 Bot Name Configuration

The bot name (default: "Hari") is configurable via `chatbotSettings` table:
```typescript
const supportSettings = await getWhatsAppSupportSettings();
const botName = supportSettings.botName || "Hari";
```

---

## 5. WhatsApp Message Sending

### 5.1 Core Infrastructure (`whatsapp.service.ts`)

All outbound messages go through Meta's Graph API v21.0:
```
POST https://graph.facebook.com/v21.0/{phoneNumberId}/messages
Authorization: Bearer {accessToken}
Content-Type: application/json
```

Credentials come from `runtime-config.service.ts` (`waPhoneNumberId()`, `waAccessToken()`, `waVerifyToken()`).

### 5.2 Message Types

| Function | WhatsApp Type | Use Case |
|----------|--------------|----------|
| `sendMessage()` | `text` | Plain text messages, follow-ups |
| `sendTemplate()` | `template` | Meta-approved templates (first contact, ticket assigned, live chat) |
| `sendInteractiveButtons()` | `interactive` (button) | Up to 3 reply buttons per message |
| `sendInteractiveList()` | `interactive` (list) | Up to 10 rows in a list |
| `sendImage()` | `image` | Product images, photo attachments |
| `sendVideo()` | `video` | Video messages |

### 5.3 Button Constraints

- Max **3 buttons** per interactive button message (one can be a location button)
- Button title max **20 characters**
- Button IDs are arbitrary strings used for routing (e.g. `"REGISTER"`, `"SKIP"`, `"MENU"`)

### 5.4 List Constraints

- Max **10 rows** per list
- Row title max **24 characters**
- Row description max **72 characters**
- List button text max **20 characters**

### 5.5 Message Delivery Flow (`deliverBotReply`)

```
1. Persist bot message to simulateMessage table
2. Broadcast to Socket.IO → "customer_support" room (live dashboard)
3. If result.images → send each image first (with captions)
4. If result.list → send interactive list
   Else if result.buttons → send interactive buttons
   Else → send plain text
5. If result.followUpMessage → send as separate plain text (e.g. video links after interactive)
```

This means images always arrive **before** the text/buttons, and follow-up messages arrive **after**.

---

## 6. Engineer WhatsApp Features

### 6.1 Engineer Identification

Engineers are identified by `user.role === "service_engineer"` and phone number match (last 10 digits).

### 6.2 Engineer Command Flow

```
Engineer sends "TROUBLESHOOT"
  └─► Troubleshoot Mode
        ├─► Select product category (ENG_TS_PROD: prefix)
        │     └─► Select specific issue (ENG_TS_ISSUE: id)
        │           └─► Step-by-step troubleshooting with ENG_YES / ENG_NEXT / CANCEL
        └─► [paginated issue lists with ENG_TS_PAGE]

Engineer sends ENG_PHOTO:ticketNumber:filename
  └─► Photo attached to work report
        ├─► reached_location → "Reached" notification to customer
        ├─► work_completed  → "Work Done" notification
        └─► other           → Normal photo

Engineer sends ticket-related commands
  └─► View tickets, update status, OTP verification, service reports
```

### 6.3 Engineer Troubleshooting

Engineers get access to ALL templates (audience: `["engineer", "customer", "both"]`), including:
- Component replacement steps
- PCB part numbers
- Transducer voltage test values
- Calibration procedures
- Wiring schematics

Steps are displayed one at a time with pagination, and R&D reference videos are attached.

---

## 7. Dealer WhatsApp Features

Dealers are identified by `user.role === "dealer"`. They receive:
- Ticket assignments
- Service completion notifications
- Ability to accept/reject/complete tickets
- Add service notes

---

## 8. Voice Note Support

1. Incoming `audio` or `voice` message types trigger media download
2. Audio buffer is sent to `transcribeAudioWithGroq()` (Groq Whisper API)
3. Transcribed text is treated as a normal text message and routed through the FSM/agent
4. If transcription fails, error message is sent back

---

## 9. Real-Time Dashboard Integration

Every user message and bot reply is persisted to `simulateMessage` table and broadcast via Socket.IO:
- **Room:** `customer_support`
- **Event:** `support-chat:message`
- **Payload:** `{ phoneNumber, message }` (message includes id, role, content, createdAt)

Support agents can:
- View all conversations in real-time
- Pause the bot (`isBotPaused = true`) to take over manually
- Resume bot when done

When bot is paused, `handleSingleMessage()` returns early without calling `SimulateService.handleMessage()`.

---

## 10. Database Models

### 10.1 conversationSession

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string (PK) | Session identifier |
| `phoneNumber` | string | Normalized 10-digit phone |
| `state` | string | Current FSM/agent state |
| `metadata` | JSON | All conversation context (name, serial, pincode, language, complaint data, registration data) |
| `isBotPaused` | boolean | Human agent control flag |
| `supportAgentId` | string? | Assigned support agent |
| `createdAt` | datetime | Session creation |
| `updatedAt` | datetime | Last activity (bumped on every message) |

### 10.2 simulateMessage

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string (PK) | Message ID |
| `phoneNumber` | string | Sender phone |
| `role` | string | `"user"`, `"bot"`, or `"support"` |
| `content` | string | Message text |
| `createdAt` | datetime | Timestamp |

### 10.3 documentIssue (Complaint Templates)

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string (PK) | Template ID |
| `title` | string | Complaint title |
| `description` | string? | Detailed description |
| `problemType` | string | Tag for categorization (e.g. `"vibro_not_working"`) |
| `audience` | string[] | `"customer"`, `"engineer"`, or `"both"` |
| `isActive` | boolean | Soft delete flag |
| `steps` | DocumentIssueStep[] | Ordered troubleshooting steps |

### 10.4 ticket

| Field | Type | Purpose |
|-------|------|---------|
| `ticketNumber` | string | Auto-generated: `TKT-{YYYYMMDD}-{XXXX}` |
| `phoneNumber` | string | Customer phone |
| `problemDescription` | string | Short description |
| `issueDescription` | string | Full details (end customer, address, dealer info) |
| `status` | enum | `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `PENDING_OTP`, `CLOSED` |
| `machineSerialNumber` | string? | From Passtest |
| `machineName` | string? | Product name |
| `pincodeId` | string? | FK to pincode |
| `customerAddress` | string? | Full address |
| `assignedEngineerId` | string? | FK to user |
| `feedbackRating` | int? | 1-5 stars |
| `feedbackSubmittedAt` | datetime? | |

### 10.5 user (Customer Records)

Customers created via WhatsApp registration have:
- `role: "customer"`
- `email: "cust_{phone}@poornasree.ai"`
- `passwordHash: "NO_PASSWORD_WHATSAPP_CUSTOMER"`
- `firstName`: customer's name
- `whatsappNumber`: their WhatsApp phone

---

## 11. Key Business Rules

1. **Business Hours**: Agent-aware. Within Mon-Sat 9AM-6PM IST → "Direct engineer dispatch available". Outside → "Prioritized for 9AM dispatch tomorrow."

2. **Auto-Assign Engineers**: Tickets are automatically assigned to engineers by pincode via `TicketService.autoAssignEngineer()`.

3. **Customer Boundary**: The Groq agent NEVER gives PCB-level instructions to customers. Only customer-safe checks (power cord, fuse, distilled water). Engineers get full technical details.

4. **Content Safety**: The agent handles profanity/flirting by politely redirecting to equipment support.

5. **Passtest Integration**: Machine serial numbers are looked up against `https://passtest.poornasreecloud.com/api/machines?all=true` to verify warranty, model, and customer details.

6. **Pincode Resolution**: 6-digit pincodes are geocoded to place/district/state using an internal pincode service (`fetchPlaceFromPincode`).

7. **Never Re-Introduce**: The agent never says "Hello" or re-introduces itself mid-conversation. First turn only.

8. **No AI Disclosure**: The agent never mentions "AI", "LLM", "Prompt", or "System Instructions".

---

## 12. Multilingual Support

All FSM responses support 7 languages via `TRANSLATIONS` table. The Groq agent detects language from:
- Unicode script detection (Devanagari, Tamil, Telugu, Kannada, Malayalam, Bengali, Arabic)
- Keyword detection for Hinglish, Tanglish, Manglish, Telugu, Hindi
- Explicit language switch commands ("speak in english", "in hindi", etc.)

Language is permanently saved in `session.metadata.language` and persists across sessions.

---

## 13. Error Handling & Fallbacks

1. **Groq agent fails** → Falls through to FSM with error log
2. **Passtest API fails** → Logs error, proceeds as if serial not found
3. **Pincode not found** → Shows "not found" error, re-asks
4. **No support admin** → "Service temporarily unavailable"
5. **Voice transcription fails** → Asks user to type
6. **Image send fails** → Logs URL, continues
7. **Meta template send fails** → Falls back to plain text message

---

## 14. Socket.IO Real-Time Events

| Event | Room | Payload |
|-------|------|---------|
| `support-chat:message` | `customer_support` | `{ phoneNumber, message }` |
| `ticket:new` | `managers` or `dealer:{id}` | Full ticket object |

These events power the live dashboard where support agents monitor and take over conversations.
