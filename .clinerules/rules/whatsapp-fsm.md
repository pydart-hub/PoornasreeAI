# Rule: WhatsApp FSM (`api/src/services/simulate.service.ts`)

> ~3,276 lines. The heart of the customer-facing flow. Touch with care.

## Why this file is special
The whole customer journey — from "Hi" to a closed ticket with a
customer satisfaction rating — is a finite state machine in this one
service file. It is called from:
- `api/src/routes/simulate.routes.ts` (internal HTTP test-harness)
- `api/src/controllers/whatsapp.controller.ts` (live Meta Cloud API)

If you change the customer-facing behavior, **this is the file you
edit**.

## FSM states (current)

```
GREETING
  └─ ASK_PHONE            (validate 10-digit Indian mobile)
MAIN_MENU
  ├─ VIEW_PRODUCTS
  ├─ BOOK_SERVICE         (manual flow)
  ├─ BOOK_SERVICE_PASSTEST (serial-validated flow)
  ├─ CHECK_STATUS
  └─ FEEDBACK_RATING → FEEDBACK_SATISFIED → COMPLETED

COMPLAINT_NAME → COMPLAINT_PINCODE → COMPLAINT_PINCODE_CONFIRM
              → COMPLAINT_SERIAL → MACHINE_CONFIRM → COMPLAINT_DESCRIBE

COMPLAINT_MANUAL_*       (manual complaint with no serial)
PASSTEST_CUSTOMER_*      (serial-verified complaint)
END_CUSTOMER_ADDRESS     (create ticket)

COMPLETED
```

Global commands (recognized in any state):
- `MENU` — restart
- `BYE` — close

## Session storage
- **Redis-style in-memory** (`sessions: Map<string, SessionMeta>`).
- One session per `phoneNumber`.
- `SessionMeta` shape (top of file) carries `customerName`,
  `serialNumber`, `machineData`, `selectedProduct`,
  `complaintSubcategory`, `language`, `customComplaintPath`, etc.
- Lost on API restart — there is no Redis. That's known/accepted for
  the live bot; test harness uses `ConversationSession` Prisma model.

## Translations (the `TRANSLATIONS` map)
A single in-file `Record<string, Record<Lang, string>>` containing
every user-facing string in 7 languages:

```ts
type Lang = "en" | "hi" | "ta" | "kn" | "mr" | "te" | "bn";
```

**When you add or change ANY user-facing string you MUST:**
1. Add/update the English (`en`) value.
2. Add/update all 6 other languages, even if you machine-translate.
   Hindi is mandatory; the others can be marked TODO with a
   `[hi-only]` note for follow-up translation.
3. Use the string key in UPPER_SNAKE_CASE.
4. Use `{placeholder}` tokens for interpolation, not `${var}`.

## Helpers (imported from elsewhere)
- `prisma` — DB access (`api/src/lib/prisma.ts`)
- `embedText`, `searchVectors` — Qdrant RAG (`api/src/services/vector.service.ts`)
- `translateText` — language detection/translation (`api/src/services/translate.service.ts`)
- `formatSupportContactBlock`, `getWhatsAppSupportSettings` — admin-configurable support text
- `findVideosForQuery`, `formatVideoSuggestions` — R&D video search
- `runtime` — super-admin DB settings (overrides env)
- `handleCustomerAgentMessage`, `isGroqChatbotEnabled` — Groq conversational agent (Phase 2)
- `io` — Socket.IO (live UI updates for the test panel)

## Output type
Functions return `SimulateReply` (defined in the file):

```ts
type SimulateReply = {
  message: string;            // primary outbound text
  buttons?: Button[];          // WhatsApp interactive buttons (max 3)
  listButtonText?: string;     // when using a list message
  listSections?: ListSection[];// WhatsApp list sections (max 10 sections, 10 items each)
  imageUrl?: string;
  videoUrl?: string;
};
```

## Common change patterns

### Add a new menu option
1. Update `MAIN_MENU_MSG` translation (7 langs).
2. Add a new state constant + handler in `handleSimulate`.
3. Add the new option to the menu buttons (max 3 — promote to a
   list if more needed).

### Add a new troubleshooting flow
1. New `DocumentIssue` + steps in DB (admin UI).
2. New state constant for each step.
3. Wire it into the `ASK_PROBLEM_TYPE` switch.

### Add a new WhatsApp template message
1. Approve in Meta Business Manager.
2. Add env var to `api/.env.example` + root `.env.example`.
3. Add to `runtime-config.service.ts` so Super Admin can override.
4. Add call site in `engineer-whatsapp.service.ts` or
   `dealer-whatsapp.service.ts`.

## Never do this
- ❌ Hard-code user-facing English strings inside a controller or handler.
- ❌ Add a state that bypasses OTP on ticket close.
- ❌ Persist session state to a DB in this file (use the in-memory map).
- ❌ Remove or rename an existing `TRANSLATIONS` key without grepping
  for `t("KEY")` calls.
- ❌ Add a `setTimeout` inside the FSM (it doesn't survive restarts and
  will leak in dev).

## Verification checklist after edits
- [ ] `npx tsc --noEmit -p api` (TypeScript clean)
- [ ] Restart dev API and test via `/api/simulate` POST with a known
      phone number — observe state transitions in the in-memory map.
- [ ] Smoke: `curl http://localhost:4000/health`
- [ ] If a new translation key: grep `TRANSLATIONS[KEY_NAME]` in all 7
      language entries.