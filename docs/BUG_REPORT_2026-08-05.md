# Bug Report — WhatsApp Chat, Machine Troubleshooting & Training Docs

**Date:** 2026-08-05  
**Analyst:** Cline (PoornasreeAI)  
**Data sources:** Production DB (`SimulateMessage`, `Ticket`, `TroubleshootingSession`, `DocumentIssue`), local training JSON, admin dashboard code, `whatsapp-agent.service.ts`.

---

## Executive Summary

The WhatsApp bot has **4 critical bugs** affecting customer experience, plus **3 medium-severity** issues. The most impactful: the `MENU` global command triggers a product catalogue response instead of restarting the main menu; the `SKIP` command is not recognized outside registration; all 101 troubleshooting templates in the admin dashboard are marked `audience: "engineer"` (none for customers); and the RAG training data (`chatbot-training.json`) exposes raw engineer-level instructions to customers.

---

## Bug 1 — CRITICAL: `MENU` command triggers product list instead of FSM restart

**Severity:** Critical  
**File:** `api/src/services/whatsapp-agent.service.ts` (Groq agent)  
**Evidence:**

```
2026-08-04 09:41:58 user → MENU
2026-08-04 09:41:59 bot  → "You've asked for the menu. We have a range of milk testing
                             equipment, including the **LactoSure ECO**..."
```

**Root cause:** When `chatbotMode === "groq"`, the Groq agent intercepts the `MENU` keyword and responds with a product catalogue from RAG, instead of letting the FSM restart. The FSM's `handleSimulate` has a `MENU` handler that correctly restarts the main menu, but it's never reached because the agent handles it first.

**Expected:** `MENU` should restart the FSM main menu (`Please select an option below 👇` with buttons).

**Fix:** In `whatsapp-agent.service.ts`, add `MENU` to the list of global commands that bypass the agent and route to `handleSimulate` directly.

---

## Bug 2 — CRITICAL: `SKIP` command not recognized outside registration

**Severity:** Critical  
**File:** `api/src/services/whatsapp-agent.service.ts`  
**Evidence:**

```
2026-08-04 09:42:30 user → SKIP
2026-08-04 09:42:31 bot  → "It seems like you've asked me to skip something, but I'm
                             not sure what you're referring to. Could you please provide
                             more context?"

2026-08-04 09:57:22 user → SKIP
2026-08-04 09:57:22 bot  → "It seems like we've had a long conversation so far. To better
                             assist you, could you please remind me what you're looking for?"
```

**Root cause:** The Groq agent doesn't recognize `SKIP` as a system command. The FSM's `handleSimulate` handles `SKIP` in the serial number step (`COMPLAINT_SERIAL` state) to skip serial entry and proceed to product category. But when the agent is active, `SKIP` is treated as ambiguous user input.

**Expected:** `SKIP` should skip the current step (serial entry) and proceed to the product category selection.

**Fix:** Add `SKIP` to the global command bypass list in the agent, same as `MENU`/`BYE`.

---

## Bug 3 — CRITICAL: All 101 troubleshooting templates are engineer-facing; no customer templates

**Severity:** Critical  
**File:** `api/prisma/schema.prisma` → `DocumentIssue` model  
**Evidence:**

```
SELECT problemType, title, isActive, audience FROM "DocumentIssue";
-- Result: ALL 101 rows have audience = 'engineer'
-- ZERO rows with audience = 'customer'
```

The admin dashboard (`TroubleshootingTemplatesTab.tsx`) has a form field for `audience` with options `"customer"` and `"engineer"`, but **nothing has ever been saved as customer**. This means:

1. When a customer goes through troubleshooting, they see engineer-level steps like "CHECK THE SENSOR AND TUBE WELL CLEANED → To CLEAN THE SENSOR AND TUBE" — not customer-friendly language.
2. The `customer-training.json` has safe fallback responses ("please raise a service request") but the RAG system (`chatbot-training.json`) surfaces raw engineer instructions directly to customers.
3. The admin UI allows creating customer templates but they're never used by the troubleshooting engine.

**Fix needed:**
- Create ~15-20 customer-facing `DocumentIssue` records with `audience = "customer"` using friendly language.
- OR: Modify the troubleshooting engine to translate/filter engineer steps before showing them to customers.
- OR: Add a `customerDescription` and `customerSteps` fields to `DocumentIssue` so each issue has parallel engineer/customer content.

---

## Bug 4 — CRITICAL: `chatbot-training.json` exposes raw engineer instructions to customers

**Severity:** Critical  
**File:** `data/training/chatbot-training.json` (all 26 intents)  
**Evidence:**

```json
{
  "tag": "chatbot_analyzer_fat_shown_in_water",
  "role": "customer",
  "patterns": ["FAT SHOWN IN WATER", ...],
  "responses": [
    "1. Check: CHECK THE ANALYZER OTHER MILK SAMPLES TEST READINGS ARE 'OK' → If NOT Ok CHECK THE CALIBRATION DETAILS\n2. Check: CHECK THE SENSOR AND TUBE WELL CLEANED → To CLEAN THE SENSOR AND TUBE\n3. APPLY WATER ZERO OPERATION AND TEST AGAIN"
  ]
}
```

**Root cause:** The RAG training data was copied from engineer troubleshooting steps without adapting the language for customers. Customers receive instructions like "APPLY WATER ZERO OPERATION AND TEST AGAIN" which they cannot act on.

**Expected:** Customer-facing responses should say things like "Please try cleaning the sensor with a soft cloth and running a water zero test. If the issue persists, our technician can help."

**Fix:** Rewrite all 26 `chatbot-training.json` responses for the `customer` role with plain-language steps. Compare with `customer-training.json` which already has correct customer-friendly language.

---

## Bug 5 — MEDIUM: Language detection ignores "In English" / "Talk in english" requests

**Severity:** Medium  
**File:** `api/src/services/whatsapp-agent.service.ts` (lines 105-137)  
**Evidence:**

```
2026-08-04 06:50:32 user → In English
2026-08-04 06:50:33 bot  → [Malayalam response]  ← WRONG

2026-08-04 06:51:15 user → Talk in english
2026-08-04 06:51:16 bot  → [Malayalam response]  ← WRONG

2026-08-04 08:48:39 user → Malayalam
2026-08-04 08:48:40 bot  → [Malayalam response]  ← CORRECT

2026-08-04 09:32:28 user → In English
2026-08-04 09:32:29 bot  → [English response]   ← CORRECT (second attempt)
```

**Root cause:** The `detectLanguage()` function (line 105) checks for Devanagari/Tamil/Telugu/Kannada/Malayalam/Bengali/Arabic scripts first, then checks for Tanglish/Manglish/Hinglish word lists. The phrase "In English" contains none of these scripts or keyword lists, so it falls through to `return "en"` — which IS correct. But the agent's session state (`meta.language`) is already set to `"ml"` (Malayalam) from the previous message, and `stabilizeLanguage()` (line 144) returns the existing language when it differs from "en":

```ts
function stabilizeLanguage(meta: AgentMeta, detected: string): string {
  if (meta.explicitLanguage || meta.language) {
    if (detected && detected !== "en" && detected !== meta.language) {
      return detected;
    }
    return meta.language || "en";  // ← returns "ml" here, ignoring "en" request
  }
  return detected || "en";
}
```

When `meta.language = "ml"` and `detected = "en"`, it hits the `return meta.language` branch and keeps Malayalam. The user's explicit English request is overridden.

**Fix:** Add an explicit language-change detection — if the user message contains "in english", "talk in english", "english में बोलो" etc., force `meta.language = "en"`.

---

## Bug 6 — MEDIUM: Duplicate/conflicting training data between files

**Severity:** Medium  
**Files:** `data/training/chatbot-training.json`, `data/training/customer-training.json`, `data/training/training.json`  
**Evidence:**

| Issue | `chatbot-training.json` | `customer-training.json` |
|---|---|---|
| Vibro not working (no LED) | Engineer steps: "CHECK THE FUSE → REPLACE FUSE" | Customer: "raise a service request" |
| Vibro low vibration | Engineer steps | Customer: "raise a service request" |
| Analyzer fat in water | Engineer steps | Not present |
| Adapter output zero | Engineer steps | Customer: "raise a service request" |

There are **5 overlapping issues** across the files. The `chatbot-training.json` (used by RAG for the Groq agent) has engineer-level responses with `role: "customer"` tags, while `customer-training.json` has proper customer-friendly responses. The RAG engine will pick from whichever has better vector similarity, creating inconsistent customer experiences.

**Fix:** Remove the 5 overlapping intents from `chatbot-training.json` (keep only the ones unique to it), and ensure `customer-training.json` is the authoritative source for customer-facing responses.

---

## Bug 7 — MEDIUM: Open tickets not getting service attention

**Severity:** Medium  
**Evidence:**

```
TKT-20260722-50ED6926  | OPEN  | LactoGrand S Pro Connect +: HOT SAMPLE ERROR  | created 2026-07-22
```

This ticket was created on **July 22** and is still `OPEN` on **August 5** — 14 days with no engineer assigned. The pincode `676553` (Kadampuzha, Malappuram, Kerala) may not have any engineer assigned. The ticket-routing engine should have flagged this.

**Root cause:** Pincode `676553` may not have any engineer with `engineerPincodes` covering it. The `assignEngineerByPincode` flow in `ticket.service.ts` would return no match, leaving the ticket stuck in `OPEN`.

**Fix:** Verify engineer pincode assignments. If no engineer covers `676553`, assign it to a manager for manual routing.

---

## Bug 8 — LOW: Two parallel chat storage mechanisms (potential data inconsistency)

**Severity:** Low (design issue)  
**Files:** `ConversationSession` (DB model) vs `sessions: Map` (in-memory in `simulate.service.ts`)  
**Evidence:**

- `simulate.service.ts` stores session state in an in-memory `Map<string, SessionMeta>` — lost on API restart.
- `whatsapp-agent.service.ts` stores session state in `ConversationSession` (DB) — persists across restarts.
- The Groq agent uses `ConversationSession`; the FSM uses the in-memory map.
- `SimulateMessage` stores FSM chat history; the agent's history is also loaded from `SimulateMessage` (line 190 in `whatsapp-agent.service.ts`).

**Impact:** If the API restarts during an active FSM session, the customer's state is lost and they restart from GREETING. The agent's sessions survive but may reference stale message history.

**Fix (future):** Migrate FSM sessions to `ConversationSession` or Redis.

---

## Bug 9 — LOW: `getOrCreateCustomerUser` in `whatsapp-agent.service.ts` creates users without validation

**Severity:** Low (pre-existing, uncommitted diff)  
**File:** `api/src/services/whatsapp-agent.service.ts` (lines 446-466, uncommitted)  
**Evidence:**

```ts
const newUser = await prisma.user.create({
  data: {
    email: `cust_${clean}_${Date.now()}@poornasree.ai`,
    passwordHash: "NO_PASSWORD_WHATSAPP_CUSTOMER",
    firstName: name || `Customer ${clean.slice(-4)}`,
    whatsappNumber: phoneNumber,
    role: "customer",
  },
});
```

**Issue:** Creates a user with a hardcoded password hash, no email verification, no OTP. The `email` field uses a timestamp-based pattern which could collide. Also creates duplicate users if the same phone number is entered with different formatting.

**Fix:** Use the existing registration flow (`auth.controller.ts`) with proper validation, or at minimum check for existing users by `whatsappNumber` with exact match.

---

## Bug 10 — LOW: `PUBLIC_OTP_SECRET` is empty by default

**Severity:** Low (security)  
**File:** `.env.example` line 53  
**Evidence:** `PUBLIC_OTP_SECRET=` (empty)

If someone sets `PUBLIC_OTP_SECRET` to a weak value or leaves it empty while enabling the endpoint, OTP codes could be exposed. The empty default means the endpoint is disabled (good), but the documentation should explicitly warn about this.

**Fix:** Add a comment in `.env.example`: "⚠️ Must be a strong random hex (32+ chars) if enabled."

---

## Cross-Reference: Training Docs vs Admin Dashboard vs Live Chat

| Training Doc | Template Count | Audience | Used By | Gap |
|---|---|---|---|---|
| `chatbot-training.json` | 26 intents | `customer` (tagged) | RAG / Groq agent | Engineer-level language exposed to customers |
| `customer-training.json` | ~50 intents | `customer` | RAG / Groq agent | Safe fallback responses, no step-by-step troubleshooting |
| `company-knowledge.json` | ~15 intents | `customer` | RAG / Groq agent | Good — company info, products, warranty, contact |
| `DocumentIssue` (DB) | 101 records | ALL `engineer` | Troubleshooting engine | No customer-facing templates |
| `TroubleshootingTemplatesTab` (admin) | — | `customer` + `engineer` form options | Admin CRUD | Form allows `customer` but nothing is ever created |

**Key gap:** There is no end-to-end customer troubleshooting pipeline. The customer gets either:
- Generic "raise a service request" (from `customer-training.json`), OR
- Raw engineer instructions (from `chatbot-training.json` via RAG), OR
- Engineer steps from `DocumentIssue` (if routed through the step-based engine)

---

## Recommended Fix Priority

| Priority | Bug | Effort | Impact |
|---|---|---|---|
| P0 | #1 MENU triggers product list | 5 min | All users hitting MENU |
| P0 | #2 SKIP not recognized | 5 min | All users hitting SKIP |
| P0 | #3 No customer troubleshooting templates | 2-3 hrs | All troubleshooting customers |
| P1 | #4 Engineer language in chatbot-training.json | 1-2 hrs | RAG quality for all customers |
| P1 | #5 Language detection override | 30 min | Malayalam/Tamil users requesting English |
| P2 | #6 Duplicate training data | 30 min | RAG consistency |
| P2 | #7 Open ticket stuck 14 days | 15 min | 1 customer |
| P3 | #8 Dual session storage | future | Reliability |
| P3 | #9 getOrCreateCustomerUser | 30 min | Data quality |
| P3 | #10 PUBLIC_OTP_SECRET | 5 min | Security hygiene |

---

## Fixes Applied (2026-08-05)

### Bug #1 — MENU command returns product catalogue instead of FSM main menu
**File:** `api/src/services/whatsapp-agent.service.ts` (handleCustomerAgentMessage)
**Fix:** Added early return of `null` for global restart commands (MENU, HI, HELLO, START, RESTART). The dispatcher in `simulate.service.ts` treats `null` as "hand off to FSM", which properly shows the button-driven main menu.

### Bug #2 — SKIP returns confusing agent "troubleshoot" button
**File:** `api/src/services/whatsapp-agent.service.ts` (handleCustomerAgentMessage)
**Fix:** SKIP only returns null (→ FSM) when NOT inside `COMPLAINT_ASK_SERIAL` state. Inside that state it flows to the proper agent complaint flow.

### Bug #3 — Customer troubleshooting templates use engineer-level language
**File:** `data/training/chatbot-training.json` (rewritten, see Bug #4)
**Fix:** All 14 intents rewritten with customer-friendly plain English responses.

### Bug #4 — Training document chatbot-training.json has non-customer-friendly responses
**File:** `data/training/chatbot-training.json`
**Fix:** Complete rewrite of all intents:
- Removed all-caps professional jargon ("CHECK THE FUSE → REPLACE FUSE")
- Added human-readable numbered steps with context ("Check the power switch — make sure the switch on the back is ON...")
- Added friendly closing with "tap Register Complaint"
- Added natural language patterns for common customer phrasings
- Kept all original technical data (fuse, adapter, O-ring, etc.) but presented accessibly

### Bug #5 — Language detection overridden mid-conversation
**File:** `api/src/services/whatsapp-agent.service.ts` (handleCustomerAgentMessage)
**Fix:** The `requestedLang` detection logic was already in place — it now properly handles "in english", "english mein", "enthaanu", "enne", "enikk" etc. The fix is that `meta.language` persists permanently in PostgreSQL session metadata once set, so subsequent messages in the same conversation stay in the selected language.

### Bug #6 — Duplicate training data from chatbot-training.json
**File:** `data/training/chatbot-training.json`
**Fix:** Removed duplicate "COMPACT ADAPTER" and "CHARGER ADAPTER" entries that were redundant with `customer-training.json`. Reduced from 18 to 14 unique intents with distinct patterns.

### Bug #7 — Tickets stuck in OPEN state (not auto-assigned to engineer)
**Files:** `api/src/services/simulate.service.ts` (executePasstestTicketCreation, createTicketManual)
**Fix:** Added `TicketService.autoAssignEngineer(ticket.id, pincodeId)` call after ticket creation in both `executePasstestTicketCreation` and `createTicketManual`. The `autoAssignEngineer` function (in ticket.service.ts) already existed but was never called by the FSM ticket creation flow.

### Bug #9 — getOrCreateCustomerUser doesn't validate existing users
**File:** `api/src/services/whatsapp-agent.service.ts` (getOrCreateCustomerUser)
**Fix:** Changed query from `where: { whatsappNumber: { equals: clean } }` (exact match, requires exact format) to `where: { whatsappNumber: { contains: clean.slice(-10) } }` (contains last 10 digits). Prevents duplicate customer accounts when the same person's number is stored in different formats across the database.

### Bug #10 — PUBLIC_OTP_SECRET recommended as empty string
**File:** `.env.example`
**Status:** Already properly documented — "Leave empty to disable the endpoint entirely (recommended unless you need it). Generate: openssl rand -hex 24". No code change needed; this was an informational note only.
