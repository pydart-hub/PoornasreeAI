# WhatsApp template: engineer account setup (first outbound)

Meta blocks **free-text** messages to users who have not messaged your business in the last 24 hours. Engineer registration must use an **approved message template**.

After the engineer replies (e.g. `Hi`), the bot can send normal session messages (portal menu, tickets, etc.).

---

## 1. Create the template in Meta

1. Open [Meta Business Suite](https://business.facebook.com) → **WhatsApp Manager** → your Poornasree number.
2. Go to **Account tools** → **Message templates** → **Create template**.
3. Use these settings **exactly** (names must match the API):

| Field | Value |
|--------|--------|
| **Template name** | `engineer_account_setup` |
| **Category** | **Utility** (account / onboarding) |
| **Language** | English |

### Body text (3 variables)

Copy this into the body editor:

```
Welcome to Poornasree Service Team, {{1}}!

You have been registered as a Service Engineer by {{2}}.

Tap the button below to set your password (link valid for 7 days).

Login email: {{3}}
```

Sample values for Meta review:

| Variable | Sample |
|----------|--------|
| {{1}} | Mhd Ijaz |
| {{2}} | Rajesh Kumar |
| {{3}} | ijaz@company.com |

### Call to action button (dynamic URL)

Add **one** button:

| Field | Value |
|--------|--------|
| **Type** | Visit website |
| **Button text** | `Set password` |
| **URL type** | Dynamic |
| **Website URL** | `https://poornasree.pydart.com/set-password?token={{1}}` |

Sample value for {{1}} in review: use a fake 64-char hex string (Meta only checks format).

> **Important:** The URL host must match `FRONTEND_URL` in production. If your domain changes, update both the template and `.env`.

4. Submit for approval (usually minutes to 24 hours).
5. Wait until status is **Approved** (green).

---

## 2. Configure the API

On the VPS, add to `/root/poornasree-ai/.env` (or your API env file):

```env
WA_ENGINEER_SETUP_TEMPLATE=engineer_account_setup
WA_ENGINEER_SETUP_TEMPLATE_LANG=en
```

Redeploy the API container (`deploy.ps1 -ApiOnly`).

If `WA_ENGINEER_SETUP_TEMPLATE` is empty, the app falls back to plain text (only works inside the 24h session window).

---

## 3. How sending works

When a service manager **creates** or **resends** an engineer setup link:

1. API tries the approved **template** (works as first outbound).
2. If the template is missing, rejected, or misconfigured, API logs an error and tries **plain text** (works only if the engineer already opened a session).

The dashboard still always shows the **set-password link** to copy manually.

---

## 4. Test after approval

1. Service Manager → **Add engineer** with WhatsApp `8089732385` (or full `918089732385`).
2. Engineer should receive the template on WhatsApp **without** sending `Hi` first.
3. Tap **Set password** → opens `https://poornasree.pydart.com/set-password?token=...`
4. After password is set, engineer can send `Hi` for the portal menu.

Check API logs on failure:

```bash
docker logs poornasree-ai-api-1 2>&1 | grep -E 'whatsapp|engineer-onboarding'
```

Common errors:

| Error | Fix |
|--------|-----|
| Template name does not exist | Name/language mismatch; wait for approval |
| (#132000) Parameter count mismatch | Body/button variables don’t match this doc |
| (#131008) Parameter invalid | Sample/review rejected — simplify body text |

---

## 5. Optional: rename template

If Meta rejects `engineer_account_setup`, create another name (e.g. `poornasree_engineer_setup`) and set:

```env
WA_ENGINEER_SETUP_TEMPLATE=poornasree_engineer_setup
```

Variable layout (body + dynamic URL button) must stay the same.
