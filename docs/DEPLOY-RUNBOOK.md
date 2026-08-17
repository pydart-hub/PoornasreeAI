# PoornasreeAI Deployment Runbook

## GitHub Branch Details
- **Repository:** https://github.com/pydart-hub/PoornasreeAI
- **Branch:** `AIpoorna`

## Server Details
- **SSH Alias:** `poornasree-v4`
- **IP Address:** `65.20.72.131`
- **Remote App Directory:** `/root/poornasree-ai`
- **App URL:** https://ai.poornasreecloud.com

---

## 🚨 CRITICAL: Production `.env` Rules — READ BEFORE DEPLOYING

> **Incident (Aug 2026):** The VPS `/root/poornasree-ai/.env` was accidentally overwritten
> with the **local dev** `.env`. This changed `JWT_SECRET`, which is used as the AES-GCM
> encryption key for secrets stored in the `SystemSetting` DB table. All WhatsApp tokens and
> API keys became unreadable — the bot silently stopped replying to WhatsApp messages for 3 days.

### ❌ NEVER do this

| Action | Why it breaks things |
|--------|----------------------|
| Copy local `.env` to the server | Local dev has `localhost` URLs and a different `JWT_SECRET` |
| Change `JWT_SECRET` on the server | It is the AES-GCM key for all encrypted DB secrets — changing it corrupts WhatsApp tokens, Groq key, etc. |
| Run `git stash pop` that includes `.env` | Can silently overwrite production secrets |
| Deploy without verifying `.env` afterwards | Misconfigured `.env` causes silent failures (no error shown to users) |

### ✅ The production `.env` MUST always contain

```dotenv
POSTGRES_PASSWORD=poorna_secure_pass_2026     # ← production DB password (not testpass123)
JWT_SECRET=RF9JUeGQjKo2EzrnDB1Ipiyh4APVWgMS  # ← NEVER CHANGE — encrypts DB secrets
CORS_ORIGIN=https://ai.poornasreecloud.com    # ← NOT http://localhost:3000
FRONTEND_URL=https://ai.poornasreecloud.com   # ← NOT http://localhost:3000
WA_PHONE_NUMBER_ID=1078437758683658
WA_ACCESS_TOKEN=<real Meta permanent token>
WA_VERIFY_TOKEN=psr_chatbot_verify_2026
```

### 🔍 Quick sanity check (run after every deploy)

```bash
ssh poornasree-v4 "grep -E 'JWT_SECRET|CORS_ORIGIN|POSTGRES_PASSWORD|FRONTEND_URL' /root/poornasree-ai/.env"
```

Expected output — if ANY of these are wrong, **stop and fix before continuing**:
```
POSTGRES_PASSWORD=poorna_secure_pass_2026
JWT_SECRET=RF9JUeGQjKo2EzrnDB1Ipiyh4APVWgMS
CORS_ORIGIN=https://ai.poornasreecloud.com
FRONTEND_URL=https://ai.poornasreecloud.com
```

---

## Deploy Commands

### Local (Windows PowerShell)
```powershell
# Web only
.\scripts\deploy-quick.ps1

# API only
.\scripts\deploy-quick.ps1 -Api

# Full (API then Web)
.\scripts\deploy-quick.ps1 -Full
```

### Local (Mac/Linux)
```bash
# Web only
./scripts/deploy-quick.sh

# API only
./scripts/deploy-quick.sh --api

# Full (API then Web)
./scripts/deploy-quick.sh --full
```

### Directly on Server via SSH
```bash
ssh poornasree-v4
cd /root/poornasree-ai
git pull origin AIpoorna
cp -f docker-compose.v4.override.yml docker-compose.override.yml
bash deploy.sh quick-api   # rebuild API
bash deploy.sh quick       # rebuild Web
```

---

## ✅ Post-Deploy Verification Checklist

Run these after every deploy:

```bash
# 1. API health
ssh poornasree-v4 "curl -sf http://127.0.0.1:4002/health"
# → {"status":"ok","env":"production"}

# 2. WhatsApp webhook verify token is responding
ssh poornasree-v4 "curl -sf 'http://127.0.0.1:4002/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=psr_chatbot_verify_2026&hub.challenge=PING'"
# → PING

# 3. Runtime config loaded from DB (no decrypt errors in logs)
ssh poornasree-v4 "docker compose -f /root/poornasree-ai/docker-compose.yml logs --tail=40 api | grep runtime-config"
# → [runtime-config] Loaded 21 keys (DB overrides: ...)

# 4. JWT_SECRET is the original production value
ssh poornasree-v4 "grep JWT_SECRET /root/poornasree-ai/.env"
# → JWT_SECRET=RF9JUeGQjKo2EzrnDB1Ipiyh4APVWgMS
```

---

## 🔧 Emergency: Restore Production `.env`

If the production `.env` has been overwritten (signs: `testpass123`, `36bb67b...`, or `localhost`):

```bash
ssh poornasree-v4
cat > /root/poornasree-ai/.env << 'ENVEOF'
POSTGRES_USER=poorna_user
POSTGRES_PASSWORD=poorna_secure_pass_2026
POSTGRES_DB=poornasree_ai
JWT_SECRET=RF9JUeGQjKo2EzrnDB1Ipiyh4APVWgMS
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://ai.poornasreecloud.com
NEXT_PUBLIC_API_URL=
GROQ_API_KEY=
CHATBOT_MODE=legacy_fsm
GROQ_MODEL_FAST=llama-3.1-8b-instant
GROQ_MODEL_AGENT=llama-3.3-70b-versatile
GROQ_MAX_TOKENS_REPLY=600
WA_BUSINESS_ACCOUNT_ID=1631698127950324
WA_PHONE_NUMBER_ID=1078437758683658
WA_ACCESS_TOKEN=EAAc5q7ImYEwBREQVxKz2qv8IlupQQh40FhfIR36WiOK4grfz6V6ZBd4j99qNZASthYpouxCUksZAAQvRLPL7RZBU9G7mdQxaA0soWnPfhaVarqfpV0p3dW4tYznpmvs1KMAtafMYcErFUuIHMn2ow1YdMstp6TJRmWChF5ICUrLfgdBLGjUEaYTfN2HZCxDziAwZDZD
WA_VERIFY_TOKEN=psr_chatbot_verify_2026
WA_ENGINEER_SETUP_TEMPLATE=poornasree_engineer_activation_v2
WA_ENGINEER_SETUP_TEMPLATE_LANG=en
WA_ENGINEER_TICKET_TEMPLATE=engineer_ticket_assigned
WA_ENGINEER_TICKET_TEMPLATE_LANG=en
FRONTEND_URL=https://ai.poornasreecloud.com
PUBLIC_OTP_SECRET=681e42dbda5b6e8e87e2e0dd877c2e73df2212da58d4962c
ENVEOF
```

If the DB has encrypted rows that can no longer decrypt (wrong JWT_SECRET was active when they were saved):

```bash
# Clear corrupt encrypted rows — they will be re-imported from env on next restart
docker compose -f /root/poornasree-ai/docker-compose.yml exec -T db \
  psql -U poorna_user -d poornasree_ai \
  -c "DELETE FROM \"SystemSetting\" WHERE value LIKE 'enc:v1:%';"

# Recreate containers to pick up restored env
cd /root/poornasree-ai
docker compose up -d --force-recreate api web
```

---

## ℹ️ How Runtime Config / Secret Encryption Works

1. On startup the API runs `loadRuntimeConfig()` → reads `SystemSetting` table from DB.
2. Secret fields (WA tokens, Groq key) are stored AES-GCM encrypted using a key derived from `JWT_SECRET`.
3. If `JWT_SECRET` changes between when secrets were saved and when they are read → **decryption fails silently** → API falls back to empty env vars → WhatsApp appears unconfigured.
4. Env vars in `.env` are the **fallback** — if the DB row is missing or corrupt, the env var value is used.
5. Therefore: WA credentials in `.env` on the server are the last line of defence.
