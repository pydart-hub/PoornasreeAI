# Rule: Frontend (Next.js 14 App Router)

## Stack
- Next.js **14.2.35** (App Router, NOT pages router)
- React 18, TypeScript, Tailwind 3
- Recharts (analytics), Socket.IO client (live updates)
- Zustand (state), xlsx (dealer import), react-datasheet-grid (Excel editing)

## Routing — role-grouped route groups

```
src/app/
  layout.tsx                         ← root (Theme + Branding + Auth providers)
  page.tsx                           ← public landing
  (auth)/
    login/page.tsx
    register/page.tsx
    set-password/page.tsx            ← engineer self-onboarding token flow
  (admin)/admin/...
  (super-admin)/super-admin/...
  (service-manager)/service-manager/...
  (assistant-manager)/assistant-manager/...
  (service)/service/[id]/page.tsx    ← engineer ticket detail
  (dealer)/dealer/...
  (customer-service)/customer-service/...
  (customer-support)/support-dashboard/...
  (sales)/sales/...
  (marketing)/marketing/...
  (dashboard)/dashboard/page.tsx
```

Each group has its own `layout.tsx` that adds the role-specific
sidebar (`ResponsiveSidebar`) and theme. Keep role groups flat —
they exist for layout grouping, not for permission checks.

## Providers (`src/components/providers/`)
- `AuthProvider.tsx` — auth state, `useAuth()` hook
- `BrandingProvider.tsx` — logo + company name from `/api/branding`
- `ThemeProvider.tsx` — light/dark via `next-themes`

All three wrap the root `layout.tsx`.

## API client (`src/lib/api.ts`)
- **Always use** `apiFetch<T>` (handles cookies, JSON, errors).
- One file → one typed wrapper per endpoint.
- New endpoint → add a typed wrapper here, don't `fetch()` ad-hoc in
  components.

```ts
export async function listEngineers(): Promise<Engineer[]> {
  const data = await apiFetch<{ engineers: Engineer[] }>(
    "/api/tickets/engineers"
  );
  return data.engineers;
}
```

## Tailwind (`tailwind.config.ts`)
Use the brand tokens, not raw hex:
- `bg-primary` / `bg-primary-hover` / `bg-primary-light`
- `bg-accent` / `bg-accent-hover` / `bg-accent-light`
- `bg-surface` / `bg-surface-secondary` / `bg-surface-hover`
- `text-content` / `text-content-secondary` / `text-content-tertiary`
- `text-success` / `text-warning` / `text-error` / `text-info`

Dark variants: `dark:` prefix everywhere; tokens like `surface.dark.card`.

## Theme toggle
`<ThemeToggle />` lives in `src/components/ui/ThemeToggle.tsx`. Use
`useTheme()` from `next-themes` rather than reading `localStorage` directly.

## Components to know
- `src/components/ui/` — `Button`, `Card`, `Input`, `Badge`, `Avatar`,
  `Loading`, `Logo`, `ResponsiveSidebar`, `ResponsiveTable`,
  `LanguageSelector`.
- `src/components/admin/` — admin-only tabs (Branding, R&D videos,
  Products, Tickets, etc.).
- `src/components/service-manager/` — the **Ticket Drawer**
  (`TicketDrawer.tsx` + sub-components: `DrawerHeader`,
  `DrawerAttachments`, `DrawerAssignment`, `DrawerTimeline`, etc.).
  This is the most-touched complex component.

## State
- Local component state via `useState`.
- Cross-component state via Zustand stores (currently minimal — most
  state is server-fetched).
- Live socket data via `socket-client.ts` (`io()` wrapper).

## File-upload pattern
```tsx
const form = new FormData();
form.append("file", file);
const res = await fetch("/api/work-reports/.../images", {
  method: "POST",
  credentials: "include",
  body: form,
});
```

Use the helpers in `src/lib/api.ts` (`uploadWorkReportImage`,
`importDealersAdmin`).

## Conventions
- **"use client"** at the top of any component using hooks/events.
- Default to Server Components; mark `"use client"` only when needed.
- File names: `PascalCase.tsx` for components, `camelCase.ts` for hooks/utils.
- Props: `interface FooProps { ... }`, not `type Foo = ...`.

## Never do this
- ❌ Use the pages router (`pages/`) — it's not configured.
- ❌ Fetch directly without `credentials: "include"` (cookies will not
  be sent and you'll get 401).
- ❌ Hard-code hex colors — use Tailwind tokens.
- ❌ Skip the typed wrapper in `src/lib/api.ts` and `fetch()` inline.
- ❌ Edit `next.config.mjs` to "fix" the `ignoreBuildErrors` setting —
  it's intentional because ESLint/TS errors are checked separately
  in CI.

## Local dev
- `npm run dev` — frontend + backend on one terminal.
- `npm run dev:web` — frontend only (`:3000`).
- `./scripts/dev-with-server-api.sh` — frontend (`:5000`) + VPS API
  via SSH tunnel.
- `./scripts/dev-with-server-api.sh --public` — frontend + public
  HTTPS API (no tunnel).

## Build
- `npm run build` — Next.js build (skips lint+TS errors).
- `npm run lint` — ESLint, run separately before declaring done.

## Smoke check
```bash
curl -sS http://localhost:3000/ | head
curl -sS http://localhost:4000/health