# Super Admin Dashboard

Configure API keys and runtime options from the UI instead of editing `.env`.

## Credentials

Use the **same login screen** as everyone else (`/login`), then you are routed to `/super-admin`.

| Field | Value |
|-------|--------|
| Login | `/login` (shared auth screen) |
| Dashboard | `/super-admin` |
| Email | `superadmin@poornasree.com` |
| Password | `SuperAdmin@1234` |

**Change the password after first login** (via DB or a future password UI).

Create / reset the account on an existing server:

```bash
cd /root/poornasree-ai/api
docker compose exec api npx ts-node --transpile-only src/scripts/ensure-super-admin.ts
# or from host with DATABASE_URL set:
npx ts-node --transpile-only src/scripts/ensure-super-admin.ts
```

## What you can configure

- Groq API key, models, chatbot mode (`groq` / `legacy_fsm`)
- WhatsApp Cloud API (phone number ID, access token, verify token, business account ID, templates)
- Frontend URL, integration webhook, HR sync URL / manager ID
- Public OTP secret, Ollama URL, Qdrant URL, dealer default password

## What stays in `.env` only

- `DATABASE_URL` — required to boot
- `JWT_SECRET` — required to boot (also used to encrypt secret settings in DB)
- `POSTGRES_PASSWORD` — required for DB container

> ⚠️ **CRITICAL — JWT_SECRET is an encryption key, not just an auth secret.**
> Secrets saved via this dashboard (WhatsApp tokens, Groq key) are AES-GCM encrypted
> using a key derived from `JWT_SECRET`. If `JWT_SECRET` ever changes on the server,
> **all stored secrets become permanently unreadable** and the bot will stop responding.
> 
> - **Never change `JWT_SECRET` on the production server.**
> - **Never copy the local dev `.env` to the server** (they have different `JWT_SECRET` values).
> - The production `JWT_SECRET` is: `RF9JUeGQjKo2EzrnDB1Ipiyh4APVWgMS`
> - See `docs/DEPLOY-RUNBOOK.md` for the full emergency recovery procedure.

## Import existing `.env` keys

On first API start after deploy, any key present in the server environment is **auto-imported** into `SystemSetting` (only if that key is not already stored).

Your VPS currently has these in env (will import automatically on deploy):
`GROQ_API_KEY`, `WA_*` (phone, tokens, templates, business account), `FRONTEND_URL`, `INTEGRATION_WEBHOOK_URL`, `PUBLIC_OTP_SECRET`, `OLLAMA_URL`, `QDRANT_URL`.

To force-overwrite DB from current env:

- Super Admin UI → **Import from env**
- Or: `POST /api/super-admin/settings/import-env`
- Or: `npx ts-node --transpile-only src/scripts/import-env-settings.ts`

## How it works

1. Super Admin saves settings → stored in `SystemSetting` (secrets AES-GCM encrypted)
2. API loads settings into memory on startup and after each save
3. App code reads via `runtime.*` helpers (DB value wins over env)

Env vars remain valid as **fallback** until imported/saved in the dashboard.
