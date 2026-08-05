# Workflow: Add a new WhatsApp customer flow

> Used when the user asks to add a new state, option, or sub-flow to
> the WhatsApp FSM in `api/src/services/simulate.service.ts`.

## Trigger phrases
- "Add a new menu option on WhatsApp"
- "Add a new state for X"
- "Add a new troubleshooting flow"
- "Add bilingual messages for X"

## Steps

1. **Read** `api/src/services/simulate.service.ts` in full (or at
   least the relevant state cluster + the `TRANSLATIONS` map).
2. **Identify** the new state's place in the FSM:
   - New menu option → add to `MAIN_MENU_*` handler.
   - New sub-flow → add states after `MAIN_MENU` and before
     `END_CUSTOMER_ADDRESS`.
   - New post-ticket flow → add after `FEEDBACK_*` or `COMPLETED`.
3. **Add the state constant** (UPPER_SNAKE_CASE) at the top of
   `handleSimulate`.
4. **Add the case in the switch statement** that routes from the
   parent state.
5. **Add the handler function** or inline it. Handler returns
   `SimulateReply`.
6. **Add ALL 7 language keys** to `TRANSLATIONS` map:
   - `en` English (mandatory, full quality)
   - `hi` Hindi (mandatory)
   - `ta` Tamil
   - `kn` Kannada
   - `mr` Marathi
   - `te` Telugu
   - `bn` Bengali
   Use `UPPER_SNAKE_CASE` keys and `{placeholder}` for interpolation.
7. **If the flow needs DB writes** (creating a ticket, etc.), call
   the relevant service:
   - Tickets → `* as TicketService` (already imported)
   - User lookup → `prisma.user.findUnique(...)`
   - Pincode → `fetchPlaceFromPincode(...)` from `lib/pincode.ts`
8. **If sending WhatsApp** (outside this file), wire it in
   `whatsapp.controller.ts` only if the customer can trigger it
   via a message — otherwise the FSM returns a `SimulateReply`
   which is auto-routed.
9. **Verify**:
   - [ ] `cd api && npx tsc --noEmit` — TypeScript clean.
   - [ ] Restart `api/` dev server (`npm run dev:api`).
   - [ ] Test the flow end-to-end via `POST /api/simulate`
     (internal test harness) OR `POST /api/whatsapp/webhook`
     (live) with a known phone number.
   - [ ] Watch the in-memory `sessions` map to confirm transitions.
   - [ ] If a new translation key: `grep "TRANSLATIONS.NEW_KEY"` in
     all 7 languages.

## Output checklist (what to tell the user)

After implementing, surface:
- The new state constant(s) and where they live.
- The 7 translation keys added (or which are TODO).
- Any new env vars / DB columns / migrations needed (probably none).
- The exact test command used to verify the flow.

## Common pitfalls
- ❌ Forgetting one of the 7 languages → flaky fallback to English.
- ❌ Using `${var}` instead of `{var}` in translation strings.
- ❌ Adding the new option as a button when it would fit in the
  existing list (max 3 interactive buttons per WhatsApp message).
- ❌ Persisting state via DB (use the in-memory `sessions` map).
- ❌ Forgetting to handle the `MENU` global command in the new state.
- ❌ Returning a `SimulateReply` with a `listSections` but forgetting
  `listButtonText` (or vice versa).