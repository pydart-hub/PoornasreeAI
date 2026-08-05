# Workflow: Add a new frontend page or admin tab

> Used when the user asks to add a new page, dashboard tab, or
> role-scoped screen.

## Steps

1. **Identify the role group** the page belongs to:
   - Admin → `src/app/(admin)/admin/...`
   - Service manager → `src/app/(service-manager)/service-manager/...`
   - Dealer → `src/app/(dealer)/dealer/...`
   - Engineer → `src/app/(service)/service/...`
   - Sales → `src/app/(sales)/sales/...`
   - Marketing → `src/app/(marketing)/marketing/...`
   - Customer support → `src/app/(customer-support)/support-dashboard/...`
   - Customer service → `src/app/(customer-service)/customer-service/...`
   - Super admin → `src/app/(super-admin)/super-admin/...`
   - Public/auth → `src/app/(auth)/...`
   - Generic dashboard → `src/app/(dashboard)/dashboard/...`
2. **Create** `page.tsx` under the appropriate folder. Each role
   group already has its own `layout.tsx` (sidebar, theme).
3. **Use `"use client"`** at the top if the page uses hooks/events.
4. **Use Tailwind tokens**, never raw hex:
   - `bg-primary`, `bg-accent`, `bg-surface`, etc.
   - `dark:` variants for dark mode.
5. **Fetch via `src/lib/api.ts`** — never `fetch()` directly:
   ```tsx
   import { listEngineers } from "@/lib/api";
   const engineers = await listEngineers();
   ```
   If the endpoint is new, add a typed wrapper in `src/lib/api.ts`
   using `apiFetch<T>(...)`.
6. **Use existing UI primitives** from `src/components/ui/`:
   `Button`, `Card`, `Input`, `Badge`, `ResponsiveTable`,
   `ResponsiveSidebar`, `Loading`.
7. **Forms** — use controlled inputs with `useState`; POST/PATCH
   via the typed wrapper; show `Loading` while in flight; toast or
   inline error on failure.
8. **File uploads** — use the `uploadWorkReportImage` /
   `importDealersAdmin` helpers (already in `src/lib/api.ts`) as
   the canonical pattern.

## Verify
- [ ] `cd root && npm run lint` clean.
- [ ] `cd root && npm run build` — Next.js build green (it skips
      ESLint/TS errors but you should run them separately).
- [ ] Hit the page locally (`npm run dev`) — login with a user that
      has the right role, confirm the page renders.
- [ ] Test 401/403 by hitting the page with a different role.

## Common pitfalls
- ❌ Hard-coding hex colors instead of using `primary.*` /
  `accent.*` / `surface.*` tokens.
- ❌ Calling `fetch()` inline instead of going through `src/lib/api.ts`.
- ❌ Missing `credentials: "include"` on a manual `fetch()` (cookies
  won't be sent → 401).
- ❌ Using the pages router (`pages/`) — it's not configured.
- ❌ Forgetting `"use client"` when using `useState` / `useEffect`.