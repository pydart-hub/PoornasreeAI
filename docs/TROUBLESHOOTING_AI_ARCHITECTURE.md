# Poornasree AI Troubleshooting & WhatsApp Architecture Reference

This document details the architectural design, document grounding rules, model configurations, and role-based isolation implemented in Poornasree AI.

---

## 1. Document Grounding & Role Isolation Architecture

The system enforces strict document isolation between **Customers** and **Registered Service Engineers**:

| User Type | Document Grounding Source | Document Type in DB | Description |
|---|---|---|---|
| **Customer** | `CHATBOT_DATAS` | `customer`, `both` | Step-by-step basic machine troubleshooting (Check, Action, Remarks, no deep component disassembly). |
| **Service Engineer** | `Engineers Training` + `CHATBOT_DATAS` | `service`, `customer`, `both` | Deep technical service manuals (PCB voltages, pot adjustments, board replacements, ASCII/baud calibration). |

### Role Auto-Detection Logic
- When a user sends a message, the system checks the `User` table for their phone number (`whatsappNumber`).
- If `user.role` is one of `service_engineer`, `service_manager`, `assistant_service_manager`, `admin`, `super_admin`, or `engineer`, the session is automatically tagged with `isEngineer: true` and granted access to `service` documents.
- If the user is unlisted or has `role === "customer"`, they are strictly grounded in `customer` documents.

---

## 2. Troubleshooting Response Structure (Rule 11)

Every machine error or troubleshooting response is strictly formatted into the **Step / Check / Action / Remark** structure:

```text
📍 *Step 1:* 
🔍 *Check 1:* <Check Title in UPPERCASE>
⚡ *Action 1:* <Action Description in UPPERCASE>
• 1) <Sub-numbered setting or sub-check>
   ↳ Remark: <Detailed explanation, ASCII code, example values, or notes>
• 2) <Sub-numbered setting or sub-check>
   ↳ Remark: <Detailed explanation>

📍 *Step 2:* 
🔍 *Check 2:* <Check Title in UPPERCASE>
⚡ *Action 1:* <Action Description in UPPERCASE>
• 1) <Sub-numbered item>
   ↳ Remark: <Detailed explanation>

📍 *Step 3:*
If none of the above steps help, please contact Poornasree Customer Care for further assistance.
```

### Formatting Invariants:
1. **Mandatory Check + Action Pair**: Every step **must** have both a `🔍 *Check N:*` line and a `⚡ *Action 1:*` line.
2. **Sub-bullets & Remarks**: Configuration sub-items (e.g. `'1) WEIGHT IN COLLECTION'`) are indented with bullet points (`•`), and explanatory notes or example values are formatted as indented `↳ Remark:` lines.
3. **No Paragraph Summaries**: Rule 1 (brevity) is strictly restricted to general greetings/chit-chat; troubleshooting instructions are never condensed into a paragraph.
4. **Interactive Action Buttons**: Responses attach `[ ✅ Resolved ]` and `[ ❌ Unresolved ]` buttons for user feedback and automatic ticket escalation.

---

## 3. Complaint Intent vs Product Catalog Interceptor Guardrails

To prevent breakdown queries (e.g. `"Vibro not working"`, `"T2 error"`, `"Rate chart issue"`) from being mistakenly intercepted by the Product Catalog browser:

```typescript
const isIssueQuery =
  cleanQ.includes("not working") ||
  cleanQ.includes("not on") ||
  cleanQ.includes("issue") ||
  cleanQ.includes("error") ||
  cleanQ.includes("problem") ||
  cleanQ.includes("repair") ||
  cleanQ.includes("fault") ||
  cleanQ.includes("damage") ||
  cleanQ.includes("fail") ||
  cleanQ.includes("complaint") ||
  cleanQ.includes("blinking") ||
  cleanQ.includes("vibrating") ||
  cleanQ.includes("vibration") ||
  cleanQ.includes("noise") ||
  cleanQ.includes("leak") ||
  cleanQ.includes("variation") ||
  cleanQ.includes("കേടായി") ||
  cleanQ.includes("പരാതി");
```

- When `isIssueQuery === true`, the product catalog interceptor is bypassed, sending the user directly to the technical troubleshooting RAG pipeline.
- When `isIssueQuery === false` and the user queries a product (e.g. `"Tell me about LactoSure Eco"`, `"Show catalog"`, `"Vibro price"`), the catalog card is displayed.

---

## 4. Google Gemini AI Multi-Model Failover

The unified LLM client (`llmChat()` in `api/src/services/llm.service.ts`) communicates with Google Gemini endpoints with automatic fallback:

### Active Endpoints:
1. `gemini-3.6-flash` (Primary high-speed generation)
2. `gemini-2.5-flash-lite` (Fast fallback)
3. `gemini-3.7-flash` (Extended reasoning fallback)
4. `gemini-3.5-flash` / `gemini-3.1-flash-lite`

### Generation Settings:
- **`maxOutputTokens`**: `3000` (prevents truncation of long multi-step calibration guides like Weighing Scale ASCII matrices).
- **`temperature`**: `0.4` - `0.5` (ensures factual document grounding and zero hallucination).

---

## 5. Webhook Verification & DB Tunneling

### Meta WhatsApp Webhook
- **Webhook Verify Tokens Accepted**:
  - `poornasree_ai_webhook_secret_2026`
  - `poornasree_secret_123`
- **Controller Route**: `api/src/controllers/whatsapp.controller.ts` (`GET /api/whatsapp/webhook` & `POST /api/whatsapp/webhook`).

### Database Tunneling (VPS $\leftrightarrow$ Localhost)
- **Local Port**: `5433`
- **Target Docker Postgres**: `172.18.0.2:5432` on VPS `65.20.72.131`
- **Persistent Keep-Alive Command**:
  ```bash
  ssh -f -N -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -L 5433:172.18.0.2:5432 root@65.20.72.131
  ```
- **Quick Local Environment Startup**:
  ```bash
  ./reconnect.sh
  ```

---

## 6. Multi-Machine Support & Dynamic "Change Machine" Workflow

### Multi-Machine Discovery (`getCustomerRegisteredMachines`)
- When an existing customer enters complaint registration, the system aggregates all unique `machineSerialNumber` and `machineName` values from their historical tickets.
- If a customer owns **multiple machines** (e.g. `2510-0089` and `2410-0012`):
  - State transitions to `SELECT_REGISTERED_MACHINE`.
  - WhatsApp renders an interactive selection list showing all registered machines plus `➕ Enter Different Serial`.
- If a customer owns **1 machine**:
  - Automatically defaults to that machine and renders the complaint confirmation card.

### Dynamic "Change Machine" Flow
- The complaint confirmation card provides an interactive button: `[ 🔄 Change Machine ]`.
- Tapping this button allows the customer to switch between their known machines or enter a brand new serial number.
- When a new serial number is typed:
  - System validates it against the Passtest Machine Database (`PasstestService.searchMachine(serial)` / `fetchMachineBySerial`).
  - Upserts the machine into `prisma.machine` with model name and status.
  - Updates the confirmation summary card in real-time.

---

## 7. Automatic Customer Registration & User Profiling

### First-Time Callers (`getOrCreateCustomerUser`)
- When an unregistered customer files a service complaint, the bot collects their Name, Pincode, Address, and Serial Number.
- System automatically registers a new account in `prisma.user`:
  - `role: "customer"`
  - `whatsappNumber: phoneNumber`
  - `email: "cust_<phone>@poornasree.local"`
  - `pincodeId: validPincodeId`
- Generated tickets are explicitly linked to `ticket.customerId = customerUser.id` instead of a fallback admin account.

### Returning Customer Recognition (`startGreeting`)
- When a customer sends `"hi"` or `"menu"`:
  - `startGreeting` checks both `prisma.user` and historical ticket profiles (`loadSavedEndCustomer(phoneNumber)`).
  - Recognizes returning customers by name (e.g. *"Welcome back, Sombi! 👋"*).
  - Directly renders the Main Menu interactive list without prompting them to re-register.

---

## 8. Meta WhatsApp 1024-Character Limit Auto-Overflow Engine

Meta WhatsApp enforces a strict 1024-character maximum on `interactive.body.text`. Detailed technical calibration steps (e.g. Weighing Scale ASCII matrix, Rate Chart) frequently exceed 1000 characters.

### Auto-Overflow Architecture (`api/src/services/whatsapp.service.ts`)
- In `sendInteractiveButtons` and `sendInteractiveList`:
  - If `body.length > 1000`:
    1. Sends the complete, untruncated technical guide as a standard text message (supporting up to 4096 characters).
    2. Immediately follows with a compact interactive prompt containing the action buttons (`[ ✅ Resolved ]`, `[ ❌ Unresolved ]`).
  - If `body.length <= 1000`:
    - Sends the standard single interactive message.

---

## 9. Sentence Casing & Deduplication Post-Processing Engine

To eliminate shouting uppercase text and prevent leaked remarks:
1. **Sentence Casing (`toSentenceCase`)**: Converts all step/check titles and action descriptions to natural sentence case while preserving standard engineering acronyms:
   - Preserved Acronyms: `T2`, `USB`, `GSM`, `LED`, `ASCII`, `L-PLUG`, `AC`, `DC`, `PCB`, `RTC`, `SD`, `SMS`, `ECO`, `DPST`, `LCD`.
2. **Deduplication Filter**:
   - Strips duplicated check lines and redundant remarks.
   - Cleans secondary action markers (e.g., `⚡ *Action 10:*`) and empty remark lines.
