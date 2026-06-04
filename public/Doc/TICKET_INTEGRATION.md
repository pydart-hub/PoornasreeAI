# Poornasree — Ticket API (for external app developer)

**Base URL:** `https://poornasree.pydart.com`

**Verified on production:** 2026-06-04 — ticket `TKT-20260604-F0B92422` closed via OTP API (`4232`).

---

## One OTP workflow, three channels (same data)

Closing a ticket uses the **same server logic** whether the engineer uses:

- **Poornasree WhatsApp** (`OTP TKT-...`, `VERIFY TKT-... 4232`), or  
- **Your external app — no login** (`POST /api/public/tickets/{id}/otp`, `POST /api/public/tickets/{id}/verify-otp`), or  
- **Authenticated API** (`POST /api/tickets/{id}/otp`, …) when you already have a Bearer token (optional)

One ticket in the database — OTP requested in either place updates the other app’s view immediately.

| Action | HTTP — **no auth** (recommended) | Engineer WhatsApp |
|--------|-----------------------------------|-------------------|
| Start work | `PATCH /api/public/tickets/{id}/start` | `START TKT-...` |
| Send OTP to customer | `POST /api/public/tickets/{id}/otp` | `OTP TKT-...` |
| Resend OTP | `POST /api/public/tickets/{id}/otp` `{ "resend": true }` | `RESEND TKT-...` |
| Close with customer code | `POST /api/public/tickets/{id}/verify-otp` `{ "code": "4232" }` | `VERIFY TKT-... 4232` |

> **No login required** for `/api/public/tickets/...` actions. The server acts as the ticket's **assigned engineer**. The ticket must have `assignedEngineerId`. Closing still requires the **customer's 4-digit OTP**.

The **4-digit OTP is sent to the customer on WhatsApp only** — never in the API response.

**Poll status (no auth):**

- `GET /api/public/tickets/stage/pending-otp/{id}`
- `GET /api/public/tickets/stage/closed/{id}`

Optional webhook events: `ticket.otp_requested`, `ticket.closed`.

---

## Auth (optional)

Engineer close flow **does not require login** — use `/api/public/tickets/{id}/start`, `.../otp`, and `.../verify-otp` below.

Log in only if you need **admin override** or other authenticated routes (`/api/tickets/...` with Bearer/cookie).

### Request

```http
POST https://poornasree.pydart.com/api/auth/login
Content-Type: application/json

{
  "email": "admin@poornasree.com",
  "password": "Admin@1234"
}
```

### Response `200`

```json
{
  "message": "Login successful",
  "user": {
    "id": "22b2d869-0f3d-4fa1-85d5-61f1bf238b39",
    "email": "admin@poornasree.com",
    "firstName": "Admin",
    "lastName": "Poornasree",
    "role": "admin"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

> **Note:** `token` is returned in the JSON body on current API builds. Older deployments may only set an HTTP-only `token` cookie — use a cookie jar (`credentials: include`) in that case.

### Use on ticket calls

**Option A — Bearer (mobile / server apps):**

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Option B — Cookie (browser / same session as login):**

```http
Cookie: token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Error `401`

```json
{ "error": "Invalid credentials" }
```

---

## Close ticket — live endpoints (no auth)

**Example ticket (production):**

| Field | Value |
|-------|--------|
| `id` | `2fbeed47-a2e3-460d-8659-d062b933d7eb` |
| `ticketNumber` | `TKT-20260604-F0B92422` |

| Step | Method | URL |
|------|--------|-----|
| 1. Start work | `PATCH` | `/api/public/tickets/2fbeed47-a2e3-460d-8659-d062b933d7eb/start` |
| 2. Request OTP | `POST` | `/api/public/tickets/2fbeed47-a2e3-460d-8659-d062b933d7eb/otp` |
| 3. Verify OTP | `POST` | `/api/public/tickets/2fbeed47-a2e3-460d-8659-d062b933d7eb/verify-otp` |

Same paths under `/api/tickets/...` work **with** `Authorization: Bearer <token>` if you prefer authenticated calls.

---

### Step 1 — Start work

**Request**

```http
PATCH https://poornasree.pydart.com/api/public/tickets/2fbeed47-a2e3-460d-8659-d062b933d7eb/start
```

No body.

**Response `200` (abbreviated)**

```json
{
  "ticket": {
    "id": "2fbeed47-a2e3-460d-8659-d062b933d7eb",
    "ticketNumber": "TKT-20260604-F0B92422",
    "status": "IN_PROGRESS",
    "phoneNumber": "919048740132",
    "problemDescription": "Lactosure: Led not blinking",
    "assignedEngineerId": "f07f2470-56d5-4935-965c-83b015e81a7f"
  }
}
```

**Errors**

```json
{ "error": "Ticket not found" }
```

```json
{ "error": "You are not assigned to this ticket" }
```

(Status `403` — use assigned engineer login or admin.)

---

### Step 2 — Request OTP (sent to customer WhatsApp)

**Request**

```http
POST https://poornasree.pydart.com/api/public/tickets/2fbeed47-a2e3-460d-8659-d062b933d7eb/otp
Content-Type: application/json

{
  "resend": false
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `resend` | No | Default `false`. Use `true` if ticket is already `PENDING_OTP` and you need a new code. |

**Response `200`**

```json
{
  "message": "OTP sent to the customer via WhatsApp.",
  "expiresAt": "2026-06-04T10:45:29.666Z"
}
```

OTP valid for **30 minutes** from `expiresAt`.

**Public read after OTP (no auth) — `200`**

```http
GET https://poornasree.pydart.com/api/public/tickets/stage/pending-otp/2fbeed47-a2e3-460d-8659-d062b933d7eb
```

```json
{
  "success": true,
  "data": {
    "id": "2fbeed47-a2e3-460d-8659-d062b933d7eb",
    "ticketNumber": "TKT-20260604-F0B92422",
    "stage": "pending-otp",
    "status": "PENDING_OTP",
    "customer": {
      "name": "Admin Poornasree",
      "phone": "919048740132",
      "address": "Chembra, Palakkad, Kerala",
      "pincode": "679304"
    },
    "complaint": {
      "problemDescription": "Lactosure: Led not blinking"
    },
    "engineer": {
      "name": "mhb ijaz",
      "phone": "918089732385"
    },
    "timestamps": {
      "createdAt": "2026-06-04T10:11:04.779Z",
      "workStartedAt": "2026-06-04T10:15:28.985Z",
      "otpExpiresAt": "2026-06-04T10:45:29.666Z"
    },
    "stageMeta": {
      "otpExpiresAt": "2026-06-04T10:45:29.666Z",
      "otpAttempts": 0,
      "otpLocked": false
    }
  }
}
```

**Errors**

```json
{ "error": "An active OTP already exists. Use resend to send it again." }
```

(Status `409` — call again with `{ "resend": true }` or wait until expiry.)

```json
{ "error": "Ticket is not in PENDING_OTP state; cannot resend OTP." }
```

```json
{ "error": "No engineer assigned to this ticket" }
```

(Status `400` — assign an engineer before start/OTP.)

---

### Step 3 — Verify OTP and close

**Request**

```http
POST https://poornasree.pydart.com/api/public/tickets/2fbeed47-a2e3-460d-8659-d062b933d7eb/verify-otp
Content-Type: application/json

{
  "code": "4232"
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `code` | Yes | 4-digit string from customer (example: `4232`) |

**Response `200` (abbreviated)**

```json
{
  "message": "Ticket closed successfully",
  "ticket": {
    "id": "2fbeed47-a2e3-460d-8659-d062b933d7eb",
    "ticketNumber": "TKT-20260604-F0B92422",
    "status": "CLOSED",
    "otpVerified": true,
    "closedAt": "2026-06-04T10:19:15.661Z",
    "phoneNumber": "919048740132",
    "problemDescription": "Lactosure: Led not blinking"
  }
}
```

Customer may receive a **feedback** WhatsApp message after close.

**Public read — closed (no auth) — `200`**

```http
GET https://poornasree.pydart.com/api/public/tickets/stage/closed/2fbeed47-a2e3-460d-8659-d062b933d7eb
```

```json
{
  "success": true,
  "data": {
    "id": "2fbeed47-a2e3-460d-8659-d062b933d7eb",
    "ticketNumber": "TKT-20260604-F0B92422",
    "stage": "closed",
    "status": "CLOSED",
    "customer": {
      "name": "Admin Poornasree",
      "phone": "919048740132",
      "address": "Chembra, Palakkad, Kerala",
      "pincode": "679304",
      "place": "Chembra",
      "district": "Palakkad",
      "state": "Kerala"
    },
    "machine": {
      "name": "Lactosure",
      "serialNumber": null
    },
    "complaint": {
      "problemDescription": "Lactosure: Led not blinking",
      "issueDescription": "End customer: Aph, Service area: Chembra, Palakkad, Kerala, Pincode: 679304"
    },
    "engineer": {
      "id": "f07f2470-56d5-4935-965c-83b015e81a7f",
      "name": "mhb ijaz",
      "phone": "918089732385"
    },
    "timestamps": {
      "createdAt": "2026-06-04T10:11:04.779Z",
      "workStartedAt": "2026-06-04T10:15:28.985Z",
      "closedAt": "2026-06-04T10:19:15.661Z"
    },
    "stageMeta": {
      "otpVerified": true,
      "durationHours": 0.1
    }
  }
}
```

**Errors**

```json
{ "error": "code is required" }
```

```json
{ "error": "Invalid OTP. 2 attempt(s) remaining." }
```

```json
{ "error": "OTP has expired" }
```

```json
{ "error": "OTP locked after 3 failed attempts. A Service Manager must override to close this ticket." }
```

(Status `423` when locked.)

---

## Read tickets by stage (no auth)

**Prefix:** `/api/public`

| Stage | URL |
|-------|-----|
| Created | `GET /api/public/tickets/stage/created` |
| Assigned | `GET /api/public/tickets/stage/assigned` |
| In progress | `GET /api/public/tickets/stage/in-progress` |
| Pending OTP | `GET /api/public/tickets/stage/pending-otp` |
| Closed | `GET /api/public/tickets/stage/closed` |

**One ticket:** `GET /api/public/tickets/stage/{stage}/{ticket-uuid}`

**List filters:** `?page=1&limit=100` · `?since=2026-06-01T00:00:00Z` · `?ticketNumber=TKT-20260604-F0B92422`

**List response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "2fbeed47-a2e3-460d-8659-d062b933d7eb",
      "ticketNumber": "TKT-20260604-F0B92422",
      "stage": "closed",
      "status": "CLOSED",
      "customer": { "name": "...", "phone": "919048740132", "pincode": "679304" }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 1,
    "pages": 1
  }
}
```

**Legacy (all statuses):** `GET /api/public/tickets?limit=5` → `{ "tickets": [ ... ], "total", "page", "limit", "pages" }`

---

## Full example sequence (external app)

```
1. GET  /api/public/tickets/stage/assigned?ticketNumber=TKT-20260604-F0B92422
       → id = 2fbeed47-a2e3-460d-8659-d062b933d7eb

2. PATCH /api/public/tickets/{id}/start
       → status IN_PROGRESS

3. POST /api/public/tickets/{id}/otp  { "resend": false }
       → OTP on customer WhatsApp; expiresAt in response

4. GET  /api/public/tickets/stage/pending-otp/{id}
       → confirm stage pending-otp

5. Customer says code e.g. 4232

6. POST /api/public/tickets/{id}/verify-otp  { "code": "4232" }
       → status CLOSED

7. GET  /api/public/tickets/stage/closed/{id}
       → closedAt, otpVerified
```

### PowerShell (no login)

```powershell
$Base = "https://poornasree.pydart.com"
$id   = "2fbeed47-a2e3-460d-8659-d062b933d7eb"

Invoke-WebRequest -Method PATCH -Uri "$Base/api/public/tickets/$id/start" -UseBasicParsing | Out-Null
Invoke-WebRequest -Method POST -Uri "$Base/api/public/tickets/$id/otp" -ContentType "application/json" -Body '{"resend":false}' -UseBasicParsing | Out-Null
$ver = Invoke-WebRequest -Method POST -Uri "$Base/api/public/tickets/$id/verify-otp" -ContentType "application/json" -Body '{"code":"4232"}' -UseBasicParsing
($ver.Content | ConvertFrom-Json).message  # Ticket closed successfully
```

### cURL (no login)

```bash
BASE="https://poornasree.pydart.com"
ID="2fbeed47-a2e3-460d-8659-d062b933d7eb"

curl -s -X PATCH "$BASE/api/public/tickets/$ID/start"

curl -s -X POST "$BASE/api/public/tickets/$ID/otp" \
  -H "Content-Type: application/json" \
  -d '{"resend":false}'

curl -s -X POST "$BASE/api/public/tickets/$ID/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"code":"4232"}'

curl -s "$BASE/api/public/tickets/stage/closed/$ID"
```

---

## Optional webhook

Register a `POST` URL with Poornasree for:

`ticket.created` · `ticket.assigned` · `ticket.started` · `ticket.otp_requested` · `ticket.closed`

Payload `data` matches the public stage GET shape for that ticket.

---

## E2E test (Poornasree team)

```powershell
cd PoornasreeAI/api
powershell -File scripts/test-stage-e2e.ps1
```

Seed accounts: `dealer@poornasree.com` / `Dealer@1234`, `admin@poornasree.com` / `Admin@1234`, `engineer1@poornasree.com` / `Engineer@1234`.

Steps 4–5 in the script use the same `POST .../otp` and `POST .../verify-otp` endpoints documented above.
