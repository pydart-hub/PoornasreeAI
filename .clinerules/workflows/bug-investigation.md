# Workflow: Bug investigation

> Used when the user reports a bug, broken feature, or unexpected
> behavior. Goal: find the root cause with minimum diff.

## Steps

1. **Reproduce the bug** by reading the code path the user
   describes. Use `search_files` / `read_file` to trace from the
   entry point (a route, a webhook, a page) all the way down to
   where the symptom would manifest.
2. **Common entry points** to check first:
   - WhatsApp bot misbehaving → `api/src/services/simulate.service.ts`
   - Webhook not firing → `api/src/controllers/whatsapp.controller.ts`
     (look at `processedIds` Set — is the message being deduped?)
   - Login broken → `api/src/controllers/auth.controller.ts` +
     `api/src/middleware/auth.ts`
   - 401 on a normally-working page → check the route mount order
     in `api/src/index.ts`
   - Ticket state machine stuck → `api/src/services/ticket.service.ts`
     + the FSM (for customer-side flows)
3. **Read the relevant rule** if it exists:
   - WhatsApp FSM bug → `.clinerules/rules/whatsapp-fsm.md`
   - Route/auth bug → `.clinerules/rules/api-routes.md`
   - Schema mismatch → `.clinerules/rules/prisma-schema.md`
4. **Inspect state** in dev:
   - WhatsApp session → restart API and watch the `sessions` Map.
   - DB state → connect to local Postgres:
     `psql $DATABASE_URL` or `npx prisma studio`.
5. **Form a hypothesis, then test it**:
   - Add a `console.log` (this repo's convention — no winston).
   - Run `curl http://localhost:4000/health` to confirm API up.
   - Re-run the failing flow.
6. **Fix** at the smallest viable scope. **Don't refactor** while
   you're fixing a bug — keep the diff narrow.
7. **Verify** the fix:
   - The failing flow now works.
   - No other flow broke (`curl /health`, hit 2-3 other endpoints).
   - TypeScript clean (`npx tsc --noEmit`).
8. **If the fix touches the WhatsApp FSM**, add the relevant
   7-language `TRANSLATIONS` entries if you added any user-facing
   strings.

## Don't do
- ❌ Refactor unrelated code "while you're in there."
- ❌ Add a workaround (e.g. catch + swallow) instead of fixing the
  root cause.
- ❌ Add a new dependency without explicit request.
- ❌ Disable a security check (`protect`, `authorize`) to "make it
  work" — that's almost always the wrong fix.
- ❌ Commit a `.env`, `.env.local`, or SSH key (see `.gitignore`).

## Output checklist

Tell the user:
- Root cause (one sentence).
- File(s) changed and what changed in each.
- Why this is the right fix (not a workaround).
- Any follow-up risks or related code paths to watch.